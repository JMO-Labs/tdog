import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { splitLeaf, type Node } from "./tree";

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
