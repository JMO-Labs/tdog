import type { JournalRecord } from "./types";

export type Query = { text: string; regex: boolean; caseSensitive: boolean };
export type Hit = {
  pane: string;
  sid: string;
  rkey: string;
  rec: number;
  cmd: string;
  at: number;
  exit?: number;
  line: string;
  lineNo: number;
  inCmd: boolean;
};

const MAX_PER_REC = 20;
const WIDTH = 198; // + up to two "…" = 200

/** Compile a query to a global RegExp, or null when empty/invalid. */
export function compile(q: Query): RegExp | null {
  if (!q.text.trim()) return null;
  const src = q.regex ? q.text : q.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(src, q.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

/** <=200 chars of [ls,le) centred on the match at i (length n). */
function snippet(s: string, ls: number, le: number, i: number, n: number) {
  if (le - ls <= WIDTH + 2) return s.slice(ls, le);
  const mid = i + (n >> 1);
  let from = Math.max(ls, mid - (WIDTH >> 1));
  const to = Math.min(le, from + WIDTH);
  from = Math.max(ls, to - WIDTH);
  return (from > ls ? "…" : "") + s.slice(from, to) + (to < le ? "…" : "");
}

/** Pure: hits for one record (cmd first, then output lines in order). */
export function matchRecord(rec: JournalRecord, query: Query): Hit[] {
  const re = compile(query);
  if (!re) return [];
  const base = {
    pane: rec.pane,
    sid: rec.sid,
    rkey: rec.rkey,
    rec: rec.rec,
    cmd: rec.cmd,
    at: Date.parse(rec.start),
    exit: rec.exit,
  };
  const hits: Hit[] = [];
  const c = firstMatch(re, rec.cmd, 0);
  if (c)
    hits.push({
      ...base,
      line: snippet(rec.cmd, 0, rec.cmd.length, c.index, c[0].length),
      lineNo: 0,
      inCmd: true,
    });
  const out = rec.out;
  let lineNo = 0;
  let counted = 0; // newlines before `counted` are in lineNo
  let from = 0;
  while (hits.length < MAX_PER_REC + (c ? 1 : 0)) {
    const m = firstMatch(re, out, from);
    if (!m) break;
    const i = m.index;
    const ls = out.lastIndexOf("\n", i - 1) + 1;
    let le = out.indexOf("\n", i);
    if (le < 0) le = out.length;
    for (let p = out.indexOf("\n", counted); p >= 0 && p < ls;)
      (lineNo++, (counted = p + 1), (p = out.indexOf("\n", counted)));
    counted = ls;
    hits.push({
      ...base,
      line: snippet(out, ls, le, i, m[0].length),
      lineNo,
      inCmd: false,
    });
    from = le + 1; // one hit per line
    if (from > out.length) break;
  }
  return hits;
}

/** First non-empty match at/after `from` (empty matches are skipped). */
function firstMatch(re: RegExp, s: string, from: number) {
  re.lastIndex = from;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[0]) return m;
    re.lastIndex = m.index + 1;
    if (re.lastIndex > s.length) return null;
  }
  return null;
}
