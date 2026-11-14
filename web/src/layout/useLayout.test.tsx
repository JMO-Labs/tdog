import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const killScene = vi.fn();
vi.mock("../terminal/sessions", () => ({
  killScene: (s: string) => killScene(s),
}));

import { useLayout } from "./useLayout";
import { loadLayout } from "./store";
import { leaves } from "./tree";

beforeEach(() => {
  localStorage.clear();
  killScene.mockClear();
});

test("starts with one pane, split adds a second, both persisted", () => {
  const { result } = renderHook(() => useLayout("s"));
  const first = leaves(result.current.tree!)[0];
  act(() => result.current.split(first, "row"));
  expect(leaves(result.current.tree!)).toHaveLength(2);
  expect(loadLayout("s")).toEqual(result.current.tree);
});

test("restores the saved layout on mount", () => {
  const a = renderHook(() => useLayout("s"));
  act(() => a.result.current.split(leaves(a.result.current.tree!)[0], "col"));
  const saved = a.result.current.tree;
  a.unmount();
  const b = renderHook(() => useLayout("s"));
  expect(b.result.current.tree).toEqual(saved);
});

test("close kills that pane's shell; closing the last leaves empty", () => {
  const { result } = renderHook(() => useLayout("s"));
  const first = leaves(result.current.tree!)[0];
  act(() => result.current.split(first, "row"));
  act(() => result.current.close(first));
  expect(killScene).toHaveBeenCalledWith(first);
  const last = leaves(result.current.tree!)[0];
  act(() => result.current.close(last));
  expect(result.current.tree).toBeNull();
  expect(loadLayout("s")).toBeNull();
  act(() => result.current.reset());
  expect(leaves(result.current.tree!)).toHaveLength(1);
});

test("ratio updates the split", () => {
  const { result } = renderHook(() => useLayout("s"));
  act(() => result.current.split(leaves(result.current.tree!)[0], "row"));
  const id = (result.current.tree as { id: string }).id;
  act(() => result.current.ratio(id, 0.3));
  expect(result.current.tree).toMatchObject({ ratio: 0.3 });
});
