import { titleStore } from "../terminal/titles";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { memJournal } from "./db";
import type { Hit } from "./search";

const mem = memJournal();
vi.mock("./db", async (orig) => ({
  ...(await orig<typeof import("./db")>()),
  journalDB: () => mem,
}));
const hits = vi.hoisted(() => ({ list: [] as Hit[] }));
vi.mock("./useJournalSearch", () => ({
  useJournalSearch: () => ({ hits: hits.list, done: true }),
}));
const jump = vi.hoisted(() => vi.fn(() => "scrolled"));
vi.mock("./jump", async (orig) => ({
  ...(await orig<typeof import("./jump")>()),
  jumpTo: jump,
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../overlays/toast", () => ({ useToast: () => toast }));
import { SearchPanel } from "./SearchPanel";

const mk = (pane: string, rec: number, cmd: string, exit?: number): Hit => ({
  pane,
  sid: "s",
  rec,
  rkey: `s/${rec}`,
  cmd,
  at: Date.now() - 120_000,
  exit,
  line: `out of ${cmd}`,
  lineNo: 0,
  inCmd: false,
});
const scenes = [
  { id: "sc1", name: "work" },
  { id: "sc2", name: "play" },
];
const leafMap = { sc1: ["p1"], sc2: ["p2"] };
const ui = (p: Partial<React.ComponentProps<typeof SearchPanel>> = {}) => (
  <SearchPanel
    open
    onClose={() => {}}
    scenes={scenes}
    leafMap={leafMap}
    {...p}
  />
);
const write = vi.fn(async (_: string) => {});
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: write } });
  hits.list = [
    mk("p1", 1, "ls", 0),
    mk("p2", 2, "make", 2),
    mk("gone", 3, "old"),
  ];
  await mem.apply("p1", "s", [
    { seq: 1, kind: "start", rec: 1, cmd: "ls", at: "2026-01-01T00:00:00Z" },
    { seq: 2, kind: "out", rec: 1, text: "FULL", at: "2026-01-01T00:00:00Z" },
  ]);
});

it("labels panes like the pane header: shell title, else Shell N", () => {
  titleStore.set("p2", { title: "vim" });
  try {
    render(ui({ leafMap: { sc1: ["x", "p1"], sc2: ["p2"] } }));
    const groups = screen
      .getAllByRole("group")
      .map((g) => g.getAttribute("aria-label"));
    expect(groups.slice(0, 2)).toEqual(["work › Shell 2", "play › vim"]);
  } finally {
    titleStore.remove("p2");
  }
});

it("groups hits by scene then pane, orphans under Other sessions", () => {
  render(ui());
  const groups = screen
    .getAllByRole("group")
    .map((g) => g.getAttribute("aria-label"));
  expect(groups).toEqual([
    "work › Shell 1",
    "play › Shell 1",
    "Other sessions › gone",
  ]);
  const opts = screen.getAllByRole("option");
  expect(opts).toHaveLength(3);
  expect(opts[0].textContent).toContain("ls");
  expect(opts[0].textContent).toContain("2m ago");
  expect(opts[1].textContent).toContain("exit 2");
  expect(opts[1].querySelector(".sp-exit")?.className).toContain("bad");
  expect(screen.getByRole("dialog", { name: "Search history" })).toBeTruthy();
  expect(screen.getByRole("listbox")).toBeTruthy();
});

it("arrows move selection, Enter jumps, Esc closes", async () => {
  const onClose = vi.fn();
  render(ui({ onClose }));
  const input = screen.getByRole("searchbox");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe(
    "true",
  );
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.keyDown(input, { key: "ArrowUp" }); // clamps
  expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe(
    "true",
  );
  fireEvent.keyDown(input, { key: "Enter" });
  expect(jump).toHaveBeenCalledWith(hits.list[0]);
  expect(onClose).toHaveBeenCalledTimes(1); // scrolled closes the panel
  fireEvent.keyDown(input, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(2);
});

it("copy buttons write exact strings", async () => {
  Object.assign(navigator, { clipboard: { writeText: write } });
  render(ui());
  const o = screen.getAllByRole("option")[0];
  const q = (n: string) =>
    o.querySelector(`[aria-label="${n}"]`) as HTMLElement;
  fireEvent.click(q("Copy command"));
  fireEvent.click(q("Copy output"));
  fireEvent.click(q("Copy both"));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(3));
  expect(write.mock.calls.map((c) => c[0])).toEqual([
    "ls",
    "FULL",
    "$ ls\nFULL",
  ]);
});

it("empty state, with and without sync", () => {
  hits.list = [];
  const { rerender } = render(ui());
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zz" } });
  expect(
    screen.getByText("No matches in this browser's history."),
  ).toBeTruthy();
  expect(screen.getByText(/Turn on history sync in Settings/)).toBeTruthy();
  rerender(ui({ syncOn: true }));
  expect(screen.queryByText(/Turn on history sync/)).toBeNull();
});

it("Esc restores focus to the element focused before opening", () => {
  const b = document.createElement("button");
  document.body.append(b);
  b.focus();
  const { rerender } = render(ui({ open: false }));
  rerender(ui({ open: true }));
  expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
  expect(document.activeElement).toBe(b);
  b.remove();
});

it("arrows scroll the selected option into view", () => {
  const sv = vi.fn();
  Element.prototype.scrollIntoView = sv;
  render(ui());
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "ArrowDown" });
  expect(sv).toHaveBeenCalledWith({ block: "nearest" });
  // @ts-expect-error cleanup
  delete Element.prototype.scrollIntoView;
});

it("copy of a missing record or without clipboard shows the failure toast", async () => {
  hits.list = [mk("gone", 9, "x")];
  render(ui());
  const o = screen.getAllByRole("option")[0];
  fireEvent.click(o.querySelector('[aria-label="Copy output"]')!);
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith("fail", "Copy failed"),
  );
  Object.assign(navigator, { clipboard: undefined });
  fireEvent.click(o.querySelector('[aria-label="Copy command"]')!);
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
  expect(toast).toHaveBeenLastCalledWith("fail", "Copy failed");
});

it("renders portaled to document.body so pane sashes can't sit above it", () => {
  const { container } = render(ui());
  const dlg = screen.getByRole("dialog", { name: "Search history" });
  expect(container.contains(dlg)).toBe(false);
  expect(dlg.closest(".sp-backdrop")?.parentElement).toBe(document.body);
});
