import type { JournalDB } from "./db";
import type { JournalEvent, JournalRecord } from "./types";

/** Cap per record's `out`, in characters (UTF-16 units), not bytes. */
export const OUT_CAP = 2 * 1024 * 1024;
const MARK = "…";

/** Keep head and tail of `s` with a marker between when over OUT_CAP. */
export function capOut(s: string): string {
  if (s.length <= OUT_CAP) return s;
  const keep = OUT_CAP - MARK.length;
  const head = Math.ceil(keep / 2);
  return s.slice(0, head) + MARK + s.slice(s.length - (keep - head));
}

/** Pure: apply one event to a record (or none yet). */
export function fold(
  r: JournalRecord | undefined,
  ev: JournalEvent,
  pane = r?.pane ?? "",
  sid = r?.sid ?? "",
): JournalRecord {
  const base: JournalRecord = r ?? {
    pane,
    sid,
    rec: ev.rec,
    rkey: `${sid}/${ev.rec}`,
    cmd: "",
    cwd: "",
    start: ev.at,
    out: "",
  };
  switch (ev.kind) {
    case "start":
      return { ...base, cmd: ev.cmd ?? base.cmd, cwd: ev.cwd ?? base.cwd };
    case "out":
      return { ...base, out: capOut(base.out + (ev.text ?? "")) };
    case "end":
      return { ...base, exit: ev.exit, end: ev.at };
    case "gap":
      return { ...base, gap: ev.why ?? "", end: ev.at };
  }
}

type StartCb = (pane: string, sid: string, rec: number) => void;
const startSubs = new Set<StartCb>();

/** Subscribe to start events (pane, session id, rec); returns unsubscribe. */
export function onJournalStart(cb: StartCb): () => void {
  startSubs.add(cb);
  return () => void startSubs.delete(cb);
}

/**
 * Persist events, then notify start subscribers. Resolves to the highest seq
 * in `evs`; rejects (without notifying) if the db fails. Duplicate seqs are
 * dropped by the db (idempotent per pane).
 */
export async function ingest(
  db: JournalDB,
  pane: string,
  sid: string,
  evs: JournalEvent[],
): Promise<number> {
  const prev = (await db.apply(pane, sid, evs)) ?? 0;
  for (const e of evs) {
    // Resent (already stored) starts are not new: no second marker.
    if (e.kind === "start" && e.seq > prev)
      startSubs.forEach((cb) => cb(pane, sid, e.rec));
  }
  return evs.reduce((m, e) => Math.max(m, e.seq), 0);
}
