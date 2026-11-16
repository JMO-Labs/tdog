import { apiFetch } from "../auth/api";
import { getHistorySync } from "../settings/prefs";
import { journalDB, type JournalDB } from "./db";
import { loadLayout } from "../layout/store";
import { leaves } from "../layout/tree";
import { loadScenes } from "../shell/scenes";
import type { JournalEvent } from "./types";

const PULLED_KEY = "tdog.pulledPanes";

function pulled(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PULLED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function setPulled(ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(PULLED_KEY, JSON.stringify(ids));
    else localStorage.removeItem(PULLED_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Pane ids in this browser's saved layouts. */
function localPanes(): Set<string> {
  const out = new Set<string>();
  for (const s of loadScenes().scenes) {
    const t = loadLayout(s.id);
    if (t) leaves(t).forEach((id) => out.add(id));
  }
  return out;
}

type Line = { pane: string; sid: string; ev: JournalEvent };

function parse(text: string): Line[] {
  const out: Line[] = [];
  for (const raw of text.split("\n")) {
    if (!raw) continue;
    try {
      const l = JSON.parse(raw) as Line;
      if (
        typeof l.pane === "string" &&
        typeof l.sid === "string" &&
        typeof l.ev?.seq === "number" &&
        typeof l.ev.kind === "string"
      )
        out.push(l);
    } catch {
      /* malformed line: skip */
    }
  }
  return out;
}

async function present(db: JournalDB, pane: string): Promise<boolean> {
  for await (const _ of db.records(pane)) return true;
  return false;
}

/**
 * Pull other devices' synced history (once per load) into the local db, for
 * panes this browser holds nothing for. Never acks: the server copy is a mirror.
 * Panes pulled earlier (tdog.pulledPanes) that are not local are forgotten
 * first, so server-side kills and expiry propagate; with sync off they are all
 * forgotten. No-op when the journal is unavailable.
 */
export async function pullSyncedHistory(
  db: JournalDB | null = journalDB(),
  local: Set<string> = localPanes(),
): Promise<void> {
  if (!db) return;
  const hours = Number(getHistorySync());
  for (const p of pulled()) if (!hours || !local.has(p)) await db.forget(p);
  setPulled([]);
  if (!hours) return;
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const r = await apiFetch(`/api/journal?since=${since}`);
  if (!r.ok) return;
  const got: string[] = [];
  const groups = new Map<string, Map<string, JournalEvent[]>>();
  for (const { pane, sid, ev } of parse(await r.text())) {
    const bySid = groups.get(pane) ?? new Map<string, JournalEvent[]>();
    bySid.set(sid, [...(bySid.get(sid) ?? []), ev]);
    groups.set(pane, bySid);
  }
  for (const [pane, bySid] of groups) {
    if (await present(db, pane)) continue;
    got.push(pane);
    for (const [sid, evs] of bySid)
      await db.apply(
        pane,
        sid,
        evs.sort((a, b) => a.seq - b.seq),
      );
  }
  setPulled(got);
}
