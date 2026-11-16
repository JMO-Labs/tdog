import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memJournal } from "./db";
import { pullSyncedHistory } from "./pull";
import { setHistorySync } from "../settings/prefs";
import type { JournalEvent } from "./types";

const at = "2026-01-01T00:00:00Z";
const ev = (
  seq: number,
  kind: JournalEvent["kind"],
  rec = 1,
): JournalEvent => ({
  seq,
  kind,
  rec,
  at,
  ...(kind === "start" ? { cmd: `c${seq}` } : { text: "o" }),
});
const line = (pane: string, sid: string, e: JournalEvent) =>
  JSON.stringify({ pane, sid, ev: e });

async function all(db: ReturnType<typeof memJournal>, pane?: string) {
  const out = [];
  for await (const r of db.records(pane)) out.push(r);
  return out;
}

const fetchMock = vi.fn();
beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const body = (s: string) => new Response(s, { status: 200 });

it("is a no-op when sync is off", async () => {
  await pullSyncedHistory(memJournal());
  expect(fetchMock).not.toHaveBeenCalled();
});

it("groups by pane and sid, skips present panes, ignores junk", async () => {
  setHistorySync("12");
  const db = memJournal();
  await db.apply("have", "s0", [ev(1, "start")]);
  fetchMock.mockResolvedValue(
    body(
      [
        line("a", "s1", ev(2, "out")),
        line("a", "s1", ev(1, "start")),
        line("a", "s2", ev(1, "start", 7)),
        line("have", "s9", ev(1, "start")),
        "not json",
        JSON.stringify({ pane: "a" }),
        "",
      ].join("\n"),
    ),
  );
  await pullSyncedHistory(db);
  expect(String(fetchMock.mock.calls[0][0])).toMatch(
    /^\/api\/journal\?since=\d+$/,
  );
  const a = await all(db, "a");
  expect(a.map((r) => r.sid).sort()).toEqual(["s1", "s2"]);
  expect(a.find((r) => r.sid === "s1")?.out).toContain("o");
  expect((await all(db, "have")).map((r) => r.sid)).toEqual(["s0"]);
});

it("does nothing on a failed request", async () => {
  setHistorySync("24");
  const db = memJournal();
  fetchMock.mockResolvedValue(new Response("x", { status: 500 }));
  await pullSyncedHistory(db);
  expect(await all(db)).toEqual([]);
});

it("forgets previously pulled panes not in the local layout, then re-pulls", async () => {
  setHistorySync("12");
  const db = memJournal();
  await db.apply("old", "s1", [ev(1, "start")]);
  await db.apply("mine", "s1", [ev(1, "start")]);
  await db.apply("keep", "s1", [ev(1, "start")]);
  localStorage.setItem(
    "tdog.pulledPanes",
    JSON.stringify(["old", "mine", "keep"]),
  );
  fetchMock.mockResolvedValue(body(line("keep", "s2", ev(1, "start"))));
  await pullSyncedHistory(db, new Set(["mine"]));
  expect(await all(db, "old")).toEqual([]);
  expect((await all(db, "mine")).map((r) => r.sid)).toEqual(["s1"]);
  expect((await all(db, "keep")).map((r) => r.sid)).toEqual(["s2"]);
  expect(JSON.parse(localStorage.getItem("tdog.pulledPanes")!)).toEqual([
    "keep",
  ]);
});

it("forgets pulled panes and clears the key when sync is off", async () => {
  const db = memJournal();
  await db.apply("old", "s1", [ev(1, "start")]);
  localStorage.setItem("tdog.pulledPanes", JSON.stringify(["old"]));
  await pullSyncedHistory(db, new Set());
  expect(await all(db, "old")).toEqual([]);
  expect(localStorage.getItem("tdog.pulledPanes")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
