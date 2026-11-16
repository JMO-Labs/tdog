import { afterEach, expect, it, vi } from "vitest";
import { idbJournal, journalDB, resumeJournal, wipeJournal } from "./db";

afterEach(() => {
  resumeJournal();
  vi.unstubAllGlobals();
});

it("stays off after wipe until resumeJournal", async () => {
  const open = vi.fn();
  vi.stubGlobal("indexedDB", {
    open,
    deleteDatabase: () => {
      const r: { onsuccess?: () => void } = {};
      setTimeout(() => r.onsuccess?.());
      return r;
    },
  });
  expect(journalDB()).not.toBeNull();
  await wipeJournal();
  expect(journalDB()).toBeNull();
  const j = idbJournal();
  await j.apply("p", "s", [{ seq: 1, rec: 1, t: "start", cmd: "ls" } as never]);
  expect(open).not.toHaveBeenCalled();
  await expect(
    (async () => {
      for await (const r of j.records()) void r;
    })(),
  ).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
  resumeJournal();
  expect(journalDB()).not.toBeNull();
});
