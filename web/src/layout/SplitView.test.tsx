import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SplitView } from "./SplitView";
import { splitLeaf, type Node } from "./tree";

const one: Node = { t: "leaf", id: "a" };
const two = splitLeaf(one, "a", "row", "b", "s1");

function setup(tree: Node, over = {}) {
  const p = {
    onSplit: vi.fn(),
    onClose: vi.fn(),
    onRatio: vi.fn(),
    renderPane: (id: string, settled: boolean) => (
      <div data-testid={`pane-${id}`} data-settled={settled} />
    ),
    ...over,
  };
  render(<SplitView tree={tree} {...p} />);
  return p;
}

test("each leaf renders a pane with split and close buttons", () => {
  const p = setup(two);
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

test("dragging the divider resizes and panes are unsettled until release", () => {
  const p = setup(two);
  const split = screen.getByTestId("split-s1");
  split.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;
  const div = screen.getByRole("separator");
  fireEvent.pointerDown(div, { clientX: 500, clientY: 0, pointerId: 1 });
  expect(screen.getByTestId("pane-a").dataset.settled).toBe("false");
  fireEvent.pointerMove(div, { clientX: 250, clientY: 0, pointerId: 1 });
  expect(p.onRatio).toHaveBeenLastCalledWith("s1", 0.25);
  fireEvent.pointerUp(div, { pointerId: 1 });
  expect(screen.getByTestId("pane-a").dataset.settled).toBe("true");
});

test("column split drags vertically", () => {
  const col = splitLeaf(one, "a", "col", "b", "s2");
  const p = setup(col);
  screen.getByTestId("split-s2").getBoundingClientRect = () =>
    ({ left: 0, top: 100, width: 1000, height: 400 }) as DOMRect;
  const div = screen.getByRole("separator");
  fireEvent.pointerDown(div, { clientX: 0, clientY: 300, pointerId: 1 });
  fireEvent.pointerMove(div, { clientX: 0, clientY: 200, pointerId: 1 });
  expect(p.onRatio).toHaveBeenLastCalledWith("s2", 0.25);
});
