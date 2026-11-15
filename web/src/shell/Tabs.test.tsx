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
  fireEvent.contextMenu(screen.getByRole("tab", { name: "beta" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Kill scene" }));
  expect(fns.onKill).toHaveBeenCalledWith("b");
  expect(fns.onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Close scene closes that scene and the menu", () => {
  const fns = setup();
  fireEvent.contextMenu(screen.getByRole("tab", { name: "alpha" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Close scene" }));
  expect(fns.onClose).toHaveBeenCalledWith("a");
  expect(fns.onKill).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("Close item blur keeps the menu open when focus moves inside it", () => {
  setup();
  fireEvent.contextMenu(screen.getByRole("tab", { name: "alpha" }));
  const closeItem = screen.getByRole("menuitem", { name: "Close scene" });
  const killItem = screen.getByRole("menuitem", { name: "Kill scene" });
  fireEvent.blur(closeItem, { relatedTarget: killItem });
  expect(screen.getByRole("menu")).toBeTruthy();
});

test("Close item blur dismisses the menu when focus leaves it", () => {
  setup();
  fireEvent.contextMenu(screen.getByRole("tab", { name: "alpha" }));
  const closeItem = screen.getByRole("menuitem", { name: "Close scene" });
  fireEvent.blur(closeItem, { relatedTarget: null });
  expect(screen.queryByRole("menu")).toBeNull();
});
