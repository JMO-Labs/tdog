import { apiFetch } from "../auth/api";
import { getHistorySync } from "../settings/prefs";
import { journalDB, type JournalDB } from "./db";
import type { JournalEvent } from "./types";

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
 * No-op when sync is off or the journal is unavailable.
 */
export async function pullSyncedHistory(
  db: JournalDB | null = journalDB(),
): Promise<void> {
  const hours = Number(getHistorySync());
  if (!hours || !db) return;
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const r = await apiFetch(`/api/journal?since=${since}`);
  if (!r.ok) return;
  const groups = new Map<string, Map<string, JournalEvent[]>>();
  for (const { pane, sid, ev } of parse(await r.text())) {
    const bySid = groups.get(pane) ?? new Map<string, JournalEvent[]>();
    bySid.set(sid, [...(bySid.get(sid) ?? []), ev]);
    groups.set(pane, bySid);
  }
  for (const [pane, bySid] of groups) {
    if (await present(db, pane)) continue;
    for (const [sid, evs] of bySid)
      await db.apply(
        pane,
        sid,
        evs.sort((a, b) => a.seq - b.seq),
      );
  }
}
