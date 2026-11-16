import { beforeEach, expect, it, vi } from "vitest";
import { memJournal } from "./db";

const mem = memJournal();
vi.mock("./db", async (orig) => ({
  ...(await orig<typeof import("./db")>()),
  journalDB: () => mem,
}));
const open = vi.fn();
vi.mock("../overlays/pane/focusedPane", () => ({
  openFocusedPaneOverlay: (id: string) => open(id),
}));
import {
  copyBoth,
  copyCommand,
  copyOutput,
  jumpTo,
  pendingRecord,
  registerPaneJump,
  setSceneSwitcher,
} from "./jump";
import type { Hit } from "./search";

const hit: Hit = {
  pane: "p1",
  sid: "s",
  rec: 1,
  rkey: "s/1",
  cmd: "ls",
  at: 1,
  line: "l",
  lineNo: 0,
  inCmd: false,
};
const write = vi.fn();
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: write } });
  await mem.apply("p1", "s", [
    { seq: 1, kind: "start", rec: 1, cmd: "ls", at: "2026-01-01T00:00:00Z" },
    {
      seq: 2,
      kind: "out",
      rec: 1,
      text: "full output\nline2",
      at: "2026-01-01T00:00:00Z",
    },
  ]);
});

it("copy helpers write exact strings from the db", async () => {
  await copyCommand(hit);
  await copyOutput(hit);
  await copyBoth(hit);
  expect(write.mock.calls.map((c) => c[0])).toEqual([
    "ls",
    "full output\nline2",
    "$ ls\nfull output\nline2",
  ]);
});

it("jump: live marker scrolls, switching scene first", () => {
  const sw = vi.fn();
  setSceneSwitcher(sw);
  const scroll = vi.fn(() => true);
  const off = registerPaneJump("p1", { scroll, open: vi.fn() });
  expect(jumpTo(hit)).toBe("scrolled");
  expect(sw).toHaveBeenCalledWith("p1");
  expect(scroll).toHaveBeenCalledWith("s/1");
  off();
});

it("jump: gone marker opens the record overlay on that pane", () => {
  const o = vi.fn();
  registerPaneJump("p1", { scroll: () => false, open: o });
  expect(jumpTo(hit)).toBe("overlay");
  expect(o).toHaveBeenCalledWith("journal-record");
  expect(pendingRecord()).toEqual({ pane: "p1", rkey: "s/1" });
});

it("jump: unmounted pane falls back to the focused pane overlay", () => {
  expect(jumpTo({ ...hit, pane: "nope" })).toBe("overlay");
  expect(open).toHaveBeenCalledWith("journal-record");
});

it("copyOutput/copyBoth reject when the record is gone", async () => {
  const gone = { ...hit, rkey: "s/99" };
  await expect(copyOutput(gone)).rejects.toThrow();
  await expect(copyBoth(gone)).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
});

it("copy rejects (not throws) without a clipboard", async () => {
  Object.assign(navigator, { clipboard: undefined });
  await expect(copyCommand(hit)).rejects.toThrow();
});
