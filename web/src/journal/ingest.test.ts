import { afterEach, describe, expect, test, vi } from "vitest";
import { memJournal, type JournalDB } from "./db";
import { capOut, fold, ingest, onJournalStart, OUT_CAP } from "./ingest";
import type { JournalEvent, JournalRecord } from "./types";

const ev = (
  seq: number,
  kind: JournalEvent["kind"],
  rec: string,
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
    await ingest(db, "p", [
      ev(1, "start", "r1", { cmd: "ls", cwd: "/x" }),
      ev(2, "out", "r1", { text: "a" }),
    ]);
    await ingest(db, "p", [
      ev(3, "out", "r1", { text: "b" }),
      ev(4, "end", "r1", { exit: 2 }),
    ]);
    expect(await all(db)).toEqual([
      {
        pane: "p",
        rec: "r1",
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
    await ingest(db, "p", [ev(1, "gap", "g1", { why: "restart" })]);
    const [r] = await all(db);
    expect(r.rec).toBe("g1");
    expect(r.gap).toBe("restart");
  });

  test("duplicate seq is ignored", async () => {
    const db = memJournal();
    const evs = [
      ev(1, "start", "r1", { cmd: "x" }),
      ev(2, "out", "r1", { text: "a" }),
    ];
    await ingest(db, "p", evs);
    await ingest(db, "p", [...evs, ev(3, "out", "r1", { text: "b" })]);
    expect((await all(db))[0].out).toBe("ab");
  });

  test("forget removes only that pane", async () => {
    const db = memJournal();
    await ingest(db, "a", [ev(1, "start", "r1")]);
    await ingest(db, "b", [ev(1, "start", "r1")]);
    await db.forget("a");
    expect((await all(db)).map((r) => r.pane)).toEqual(["b"]);
    // high-water mark cleared too: seq 1 applies again
    await ingest(db, "a", [ev(1, "start", "r2")]);
    expect(await all(db, "a")).toHaveLength(1);
  });

  test("out caps at head+tail with a marker", () => {
    const big = "H".repeat(OUT_CAP) + "T".repeat(OUT_CAP);
    const r = fold(undefined, ev(1, "out", "r", { text: big }), "p");
    expect(r.out.length).toBe(OUT_CAP);
    expect(r.out.startsWith("HHH")).toBe(true);
    expect(r.out.endsWith("TTT")).toBe(true);
    expect(r.out).toContain("…");
    expect(capOut("small")).toBe("small");
  });

  test("onJournalStart fires after apply, with (pane, rec)", async () => {
    const cb = vi.fn();
    const off = onJournalStart(cb);
    await ingest(memJournal(), "p", [ev(1, "start", "r1"), ev(2, "out", "r1")]);
    expect(cb).toHaveBeenCalledExactlyOnceWith("p", "r1");
    off();
    await ingest(memJournal(), "p", [ev(1, "start", "r2")]);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
