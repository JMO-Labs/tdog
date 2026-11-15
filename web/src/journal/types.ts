/** Mirrors Go `Event` (server journal). `at` is RFC3339. */
export interface JournalEvent {
  seq: number;
  kind: "start" | "out" | "end" | "gap";
  rec: string;
  cmd?: string;
  cwd?: string;
  text?: string;
  exit?: number;
  why?: string;
  at: string;
}

export interface JournalRecord {
  pane: string;
  rec: string;
  cmd: string;
  cwd: string;
  exit?: number;
  start: string;
  end?: string;
  out: string;
  gap?: string;
}
