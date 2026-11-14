import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { splitLeaf, type Node } from "./tree";
import { clearCommands, getCommands } from "../overlays/commands";
import { registerClear } from "../terminal/paneActions";

// Real dockview; only capture each split's relayout callback to drive it.
const relayout: Record<string, (r: number) => void> = {};
vi.mock("./dock", async (orig) => {
  const m = await orig<typeof import("./dock")>();
  return {
    ...m,
    mountSplit: (...a: Parameters<typeof m.mountSplit>) => {
      relayout[a[1] + a[2]] = a[3];
      m.mountSplit(...a);
    },
  };
});

import { SETTLE_MS, SplitView } from "./SplitView";

afterEach(() => vi.useRealTimers());

const one: Node = { t: "leaf", id: "a" };
const two = splitLeaf(one, "a", "row", "b", "s1");

function setup(tree: Node) {
  const p = {
    onSplit: vi.fn(),
    onClose: vi.fn(),
    onRatio: vi.fn(),
    onSnap: vi.fn(() => []),
    onSwap: vi.fn(),
    onMoveToScene: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    scenes: [{ id: "s2", name: "Two" }],
    renderPane: (id: string, settled: boolean) => (
      <div data-testid={`pane-${id}`} data-settled={settled} />
    ),
  };
  const r = render(<SplitView tree={tree} {...p} />);
  return { p, r };
}

test("each leaf renders a pane with split and close buttons", () => {
  const { p } = setup(two);
  expect(screen.getAllByRole("button", { name: "Split right" })).toHaveLength(
    2,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Split down" })[1]);
  expect(p.onSplit).toHaveBeenCalledWith("b", "col");
  fireEvent.click(screen.getAllByRole("button", { name: "Split right" })[0]);
  expect(p.onSplit).toHaveBeenCalledWith("a", "row");
  fireEvent.click(screen.getAllByRole("button", { name: "Close pane" })[0]);
  expect(p.onClose).toHaveBeenCalledWith("a");
});

test("nested splits render inside dockview splitviews in order", () => {
  const three = splitLeaf(two, "b", "col", "c", "s2");
  const { r } = setup(three);
  const ids = screen.getAllByTestId(/^pane-/).map((e) => e.dataset.testid);
  expect(ids).toEqual(["pane-a", "pane-b", "pane-c"]);
  const outer = screen.getByTestId("split-s1");
  expect(outer.querySelector(".dv-split-view-container")).toBeTruthy();
  expect(outer.querySelector("[data-testid=split-s2]")).toBeTruthy();
  const views = r.container.querySelectorAll(".dv-split-view-container");
  expect(views).toHaveLength(2);
});

test("a sash relayout reports the ratio; panes settle after it stops", () => {
  const { p } = setup(two);
  vi.useFakeTimers();
  act(() => relayout["row0.5"](0.25));
  expect(p.onRatio).toHaveBeenLastCalledWith("s1", 0.25);
  expect(screen.getByTestId("pane-a").dataset.settled).toBe("false");
  act(() => vi.advanceTimersByTime(SETTLE_MS - 1));
  act(() => relayout["row0.5"](0.3));
  act(() => vi.advanceTimersByTime(SETTLE_MS - 1));
  expect(screen.getByTestId("pane-b").dataset.settled).toBe("false");
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByTestId("pane-b").dataset.settled).toBe("true");
});

test("header shows title and target chip, no dockview tab strip", () => {
  const { r } = setup(two);
  const heads = r.container.querySelectorAll(".pane-head");
  expect(heads).toHaveLength(2);
  expect(heads[0].querySelector(".title")?.textContent).toBe("Shell 1");
  expect(heads[1].querySelector(".title")?.textContent).toBe("Shell 2");
  expect(heads[0].querySelector(".chip")?.textContent).toBe("local");
  expect(
    r.container.querySelector(".dv-tabs-and-actions-container"),
  ).toBeNull();
  expect(screen.getAllByRole("button", { name: "Pane menu" })).toHaveLength(2);
});

test("focus ring follows the last focused or pressed pane", () => {
  const { r } = setup(two);
  const pane = (id: string) => r.container.querySelector(`[data-pane=${id}]`)!;
  expect(pane("a").getAttribute("data-focused")).toBe("false");
  fireEvent.focus(screen.getAllByRole("button", { name: "Split down" })[0]);
  expect(pane("a").getAttribute("data-focused")).toBe("true");
  fireEvent.pointerDown(screen.getByTestId("pane-b"));
  expect(pane("a").getAttribute("data-focused")).toBe("false");
  expect(pane("b").getAttribute("data-focused")).toBe("true");
});

function rename(pane: number, text: string, key = "Enter") {
  fireEvent.click(screen.getAllByRole("button", { name: "Pane menu" })[pane]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename pane" }));
  const input = screen.getByRole("textbox", { name: "Pane name" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key });
}

test("rename from the menu reports the new title on Enter", () => {
  const { p } = setup(two);
  rename(1, "logs");
  expect(p.onRename).toHaveBeenCalledWith("b", "logs");
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("Escape cancels a rename", () => {
  const { p } = setup(two);
  rename(0, "nope", "Escape");
  expect(p.onRename).not.toHaveBeenCalled();
});

test("a custom title is shown in the header, winning over Shell N", () => {
  const tree: Node = {
    ...(two as Extract<Node, { t: "split" }>),
    b: { t: "leaf", id: "b", title: "logs" },
  };
  setup(tree);
  expect(screen.getByText("logs")).toBeTruthy();
  expect(screen.getByText("Shell 1")).toBeTruthy();
  expect(screen.queryByText("Shell 2")).toBeNull();
});

test("menu duplicate and clear scrollback act on that pane", () => {
  const { p } = setup(two);
  const clear = vi.fn();
  registerClear("b", clear);
  fireEvent.click(screen.getAllByRole("button", { name: "Pane menu" })[1]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Clear scrollback" }));
  expect(clear).toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "Pane menu" })[1]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate pane" }));
  expect(p.onDuplicate).toHaveBeenCalledWith("b");
});

test("palette has every pane action for the focused pane only", () => {
  clearCommands();
  const { p } = setup(two);
  expect(getCommands()).toHaveLength(0);
  fireEvent.focus(screen.getAllByRole("button", { name: "Split down" })[1]);
  const by = (id: string) => getCommands().find((c) => c.id === id)!;
  const clear = vi.fn();
  registerClear("b", clear);
  by("pane:duplicate").run();
  expect(p.onDuplicate).toHaveBeenCalledWith("b");
  by("pane:clear").run();
  expect(clear).toHaveBeenCalled();
  by("pane:swap-prev").run();
  expect(p.onSwap).toHaveBeenCalledWith("b", -1);
  by("pane:swap-next").run();
  expect(p.onSwap).toHaveBeenCalledWith("b", 1);
  by("pane:move:s2").run();
  expect(p.onMoveToScene).toHaveBeenCalledWith("b", "s2");
  by("pane:close").run();
  expect(p.onClose).toHaveBeenCalledWith("b");
  act(() => by("pane:rename").run());
  expect(screen.getByRole("textbox", { name: "Pane name" })).toBeTruthy();
});

test("inactive scenes register no pane commands", () => {
  clearCommands();
  render(
    <SplitView
      tree={one}
      active={false}
      onSplit={vi.fn()}
      onClose={vi.fn()}
      onRatio={vi.fn()}
      onSnap={() => []}
      renderPane={() => null}
    />,
  );
  fireEvent.focus(screen.getByRole("button", { name: "Split down" }));
  expect(getCommands()).toHaveLength(0);
});
