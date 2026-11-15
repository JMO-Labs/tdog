import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Tabs } from "./Tabs";

afterEach(cleanup);

const scenes = [
  { id: "a", name: "alpha" },
  { id: "b", name: "beta" },
];
const mount = (extra: Partial<Parameters<typeof Tabs>[0]> = {}) => {
  const p = {
    scenes,
    active: "a",
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onClose: vi.fn(),
    onReorder: vi.fn(),
    onKill: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onOpenSaved: vi.fn(),
    ...extra,
  };
  render(<Tabs {...p} />);
  return p;
};
const openMenu = (name: string) =>
  fireEvent.contextMenu(screen.getByRole("tab", { name: new RegExp(name) }));

test("context menu Kill scene kills that scene and closes the menu", () => {
  const p = mount();
  openMenu("beta");
  fireEvent.click(screen.getByRole("menuitem", { name: "Kill scene" }));
  expect(p.onKill).toHaveBeenCalledWith("b");
  expect(p.onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Close scene closes that scene and the menu", () => {
  const p = mount();
  openMenu("alpha");
  fireEvent.click(screen.getByRole("menuitem", { name: "Close scene" }));
  expect(p.onClose).toHaveBeenCalledWith("a");
  expect(p.onKill).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("Close item blur keeps the menu open when focus moves inside it", () => {
  mount();
  openMenu("alpha");
  const closeItem = screen.getByRole("menuitem", { name: "Close scene" });
  const killItem = screen.getByRole("menuitem", { name: "Kill scene" });
  fireEvent.blur(closeItem, { relatedTarget: killItem });
  expect(screen.getByRole("menu")).toBeTruthy();
});

test("Close item blur dismisses the menu when focus leaves it", () => {
  mount();
  openMenu("alpha");
  const closeItem = screen.getByRole("menuitem", { name: "Close scene" });
  fireEvent.blur(closeItem, { relatedTarget: null });
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Save calls onSave with the tab id", () => {
  const p = mount();
  openMenu("beta");
  fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));
  expect(p.onSave).toHaveBeenCalledWith("b");
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Save as… calls onSaveAs with the tab id", () => {
  const p = mount();
  openMenu("beta");
  fireEvent.click(screen.getByRole("menuitem", { name: "Save as…" }));
  expect(p.onSaveAs).toHaveBeenCalledWith("b");
});

test("context menu 'New scene from saved…' calls onOpenSaved", () => {
  const p = mount();
  openMenu("alpha");
  fireEvent.click(
    screen.getByRole("menuitem", { name: "New scene from saved…" }),
  );
  expect(p.onOpenSaved).toHaveBeenCalledTimes(1);
});

test("the dot marks only dirty tabs", () => {
  mount({ dirty: new Set(["b"]) });
  const dots = screen.getAllByRole("img", { name: "Unsaved changes" });
  expect(dots).toHaveLength(1);
  expect(screen.getByRole("tab", { name: /beta/ }).contains(dots[0])).toBe(
    true,
  );
});
