import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Tabs } from "./Tabs";

const scenes = [
  { id: "a", name: "alpha" },
  { id: "b", name: "beta" },
];

function setup() {
  const fns = {
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onClose: vi.fn(),
    onReorder: vi.fn(),
    onKill: vi.fn(),
  };
  render(<Tabs scenes={scenes} active="a" {...fns} />);
  return fns;
}

test("context menu Kill scene kills that scene and closes the menu", () => {
  const fns = setup();
  fireEvent.contextMenu(screen.getByRole("button", { name: "beta" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Kill scene" }));
  expect(fns.onKill).toHaveBeenCalledWith("b");
  expect(fns.onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Close scene closes that scene and the menu", () => {
  const fns = setup();
  fireEvent.contextMenu(screen.getByRole("button", { name: "alpha" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Close scene" }));
  expect(fns.onClose).toHaveBeenCalledWith("a");
  expect(fns.onKill).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});
