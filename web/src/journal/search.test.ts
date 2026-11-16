import { describe, expect, it } from "vitest";
import { matchRecord } from "./search";
import type { JournalRecord } from "./types";

const rec = (o: Partial<JournalRecord> = {}): JournalRecord => ({
  pane: "p",
  sid: "s",
  rec: 1,
  rkey: "s/1",
  cmd: "ls -la",
  cwd: "/",
  start: "2026-01-01T00:00:00Z",
  out: "alpha\nBeta foo\ngamma",
  ...o,
});
const q = (text: string, o = {}) => ({
  text,
  regex: false,
  caseSensitive: false,
  ...o,
});

describe("matchRecord", () => {
  it("matches output lines with lineNo", () => {
    const h = matchRecord(rec(), q("beta"));
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      line: "Beta foo",
      lineNo: 1,
      inCmd: false,
      sid: "s",
      rkey: "s/1",
      at: Date.parse("2026-01-01T00:00:00Z"),
    });
  });
  it("matches cmd first", () => {
    const h = matchRecord(rec({ out: "ls out" }), q("ls"));
    expect(h.map((x) => [x.inCmd, x.lineNo])).toEqual([
      [true, 0],
      [false, 0],
    ]);
  });
  it("case sensitivity", () => {
    expect(matchRecord(rec(), q("beta", { caseSensitive: true }))).toEqual([]);
    expect(matchRecord(rec(), q("Beta", { caseSensitive: true }))).toHaveLength(
      1,
    );
  });
  it("regex, invalid regex, empty query", () => {
    expect(matchRecord(rec(), q("^g\\w+", { regex: true }))).toHaveLength(0);
    expect(matchRecord(rec(), q("g\\w+", { regex: true }))).toHaveLength(1);
    expect(matchRecord(rec(), q("(", { regex: true }))).toEqual([]);
    expect(matchRecord(rec(), q("   "))).toEqual([]);
    expect(matchRecord(rec(), q(""))).toEqual([]);
  });
  it("zero-length regex matches terminate", () => {
    expect(matchRecord(rec(), q("a*", { regex: true })).length).toBeGreaterThan(
      0,
    );
    expect(matchRecord(rec(), q("^", { regex: true }))).toEqual([]);
  });
  it("match at index 0 of output starting with newline", () => {
    const h = matchRecord(
      rec({ cmd: "", out: "\nfoo" }),
      q("(?:\n)", { regex: true }),
    );
    expect(h[0].line).toBe("");
    expect(h[0].lineNo).toBe(0);
    const g = matchRecord(rec({ cmd: "", out: "x\ny" }), q("x"));
    expect(g[0].line).toBe("x");
  });
  it("one hit per line, capped at 20", () => {
    const out = Array.from({ length: 50 }, () => "x x").join("\n");
    const h = matchRecord(rec({ cmd: "", out }), q("x"));
    expect(h).toHaveLength(20);
    expect(h[19].lineNo).toBe(19);
  });
  it("5MB single line: snippet <=200 chars, fast", () => {
    const out = "a".repeat(2_500_000) + "NEEDLE" + "b".repeat(2_500_000);
    const t = performance.now();
    const h = matchRecord(rec({ cmd: "", out }), q("needle"));
    expect(performance.now() - t).toBeLessThan(1000);
    expect(h).toHaveLength(1);
    expect(h[0].line.length).toBeLessThanOrEqual(202);
    expect(h[0].line).toContain("NEEDLE");
    expect(h[0].line.startsWith("…")).toBe(true);
    expect(h[0].line.endsWith("…")).toBe(true);
  });
});
