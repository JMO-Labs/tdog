import { afterEach, describe, expect, test, vi } from "vitest";
import { memJournal, type JournalDB } from "./db";
import { capOut, fold, ingest, onJournalStart, OUT_CAP } from "./ingest";
import type { JournalEvent, JournalRecord } from "./types";

const ev = (
  seq: number,
  kind: JournalEvent["kind"],
  rec: number,
  x: Partial<JournalEvent> = {},
): JournalEvent => ({ seq, kind, rec, at: "2026-01-01T00:00:00Z", ...x });
const all = async (db: JournalDB, pane?: string) => {
  const o: JournalRecord[] = [];
  for await (const r of db.records(pane)) o.push(r);
  return o;
};

afterEach(() => vi.restoreAllMocks());

describe("journal fold", () => {
  test("start/out/end fold into one record, out appends", async () => {
    const db = memJournal();
    await ingest(db, "p", "A", [
      ev(1, "start", 1, { cmd: "ls", cwd: "/x" }),
      ev(2, "out", 1, { text: "a" }),
    ]);
    await ingest(db, "p", "A", [
      ev(3, "out", 1, { text: "b" }),
      ev(4, "end", 1, { exit: 2 }),
    ]);
    expect(await all(db)).toEqual([
      {
        pane: "p",
        sid: "A",
        rkey: "A/1",
        rec: 1,
        cmd: "ls",
        cwd: "/x",
        out: "ab",
        exit: 2,
        start: "2026-01-01T00:00:00Z",
        end: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  test("gap becomes its own record", async () => {
    const db = memJournal();
    await ingest(db, "p", "A", [ev(1, "gap", 7, { why: "restart" })]);
    const [r] = await all(db);
    expect(r.rec).toBe(7);
    expect(r.gap).toBe("restart");
  });

  test("duplicate seq is ignored", async () => {
    const db = memJournal();
    const evs = [
      ev(1, "start", 1, { cmd: "x" }),
      ev(2, "out", 1, { text: "a" }),
    ];
    await ingest(db, "p", "A", evs);
    await ingest(db, "p", "A", [...evs, ev(3, "out", 1, { text: "b" })]);
    expect((await all(db))[0].out).toBe("ab");
  });

  test("forget removes only that pane", async () => {
    const db = memJournal();
    await ingest(db, "a", "A", [ev(1, "start", 1)]);
    await ingest(db, "b", "A", [ev(1, "start", 1)]);
    await db.forget("a");
    expect((await all(db)).map((r) => r.pane)).toEqual(["b"]);
    // high-water mark cleared too: seq 1 applies again
    await ingest(db, "a", "A", [ev(1, "start", 2)]);
    expect(await all(db, "a")).toHaveLength(1);
  });

  test("out caps at head+tail with a marker", () => {
    const big = "H".repeat(OUT_CAP) + "T".repeat(OUT_CAP);
    const r = fold(undefined, ev(1, "out", 1, { text: big }), "p", "A");
    expect(r.out.length).toBe(OUT_CAP);
    expect(r.out.startsWith("HHH")).toBe(true);
    expect(r.out.endsWith("TTT")).toBe(true);
    expect(r.out).toContain("…");
    expect(capOut("small")).toBe("small");
  });

  test("onJournalStart fires after apply, with (pane, rec)", async () => {
    const cb = vi.fn();
    const off = onJournalStart(cb);
    await ingest(memJournal(), "p", "A", [ev(1, "start", 1), ev(2, "out", 1)]);
    expect(cb).toHaveBeenCalledExactlyOnceWith("p", "A", 1);
    off();
    await ingest(memJournal(), "p", "A", [ev(1, "start", 2)]);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("new session id restarts seq; old records are kept", async () => {
    const db = memJournal();
    await ingest(
      db,
      "p",
      "A",
      [1, 2, 3].map((n) => ev(n, "start", n)),
    );
    await ingest(
      db,
      "p",
      "B",
      [1, 2].map((n) => ev(n, "start", n)),
    );
    const rs = await all(db);
    expect(rs).toHaveLength(5);
    expect(new Set(rs.map((r) => r.rkey)).size).toBe(5);
  });

  test("append after the cap keeps the latest tail", () => {
    const full = fold(
      undefined,
      ev(1, "out", 1, { text: "x".repeat(OUT_CAP + 10) }),
      "p",
      "A",
    );
    const r = fold(full, ev(2, "out", 1, { text: "LATEST" }));
    expect(r.out.length).toBeLessThanOrEqual(OUT_CAP);
    expect(r.out.endsWith("LATEST")).toBe(true);
  });

  test("out and end without a start still make a record", () => {
    const o = fold(undefined, ev(1, "out", 4, { text: "hi" }), "p", "A");
    expect(o).toMatchObject({ out: "hi", cmd: "", rec: 4, sid: "A" });
    const e = fold(undefined, ev(1, "end", 4, { exit: 1 }), "p", "A");
    expect(e).toMatchObject({ exit: 1, rec: 4 });
  });

  test("forget after a queued apply leaves nothing", async () => {
    const db = memJournal();
    const a = ingest(db, "p", "A", [ev(1, "start", 1)]);
    const f = db.forget("p");
    await Promise.all([a, f]);
    expect(await all(db)).toEqual([]);
  });
});
