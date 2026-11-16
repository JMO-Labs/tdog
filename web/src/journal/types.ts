/** Mirrors Go `Event` (server journal). `at` is RFC3339. */
export interface JournalEvent {
  seq: number;
  kind: "start" | "out" | "end" | "gap";
  rec: number;
  cmd?: string;
  cwd?: string;
  text?: string;
  exit?: number;
  why?: string;
  at: string;
}

export interface JournalRecord {
  pane: string;
  /** Server session id: seq/rec restart per session. */
  sid: string;
  rec: number;
  /** Storage key part: `${sid}/${rec}`. */
  rkey: string;
  cmd: string;
  cwd: string;
  exit?: number;
  start: string;
  end?: string;
  out: string;
  gap?: string;
}
