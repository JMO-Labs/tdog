import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Tabs } from "./Tabs";

afterEach(cleanup);

const scenes = [
  { id: "a", name: "one" },
  { id: "b", name: "two" },
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

test("context menu Save calls onSave with the tab id", () => {
  const p = mount();
  openMenu("two");
  fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));
  expect(p.onSave).toHaveBeenCalledWith("b");
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Save as… calls onSaveAs with the tab id", () => {
  const p = mount();
  openMenu("two");
  fireEvent.click(screen.getByRole("menuitem", { name: "Save as…" }));
  expect(p.onSaveAs).toHaveBeenCalledWith("b");
});

test("context menu 'New scene from saved…' calls onOpenSaved", () => {
  const p = mount();
  openMenu("one");
  fireEvent.click(
    screen.getByRole("menuitem", { name: "New scene from saved…" }),
  );
  expect(p.onOpenSaved).toHaveBeenCalledTimes(1);
});

test("the dot marks only dirty tabs", () => {
  mount({ dirty: new Set(["b"]) });
  const dots = screen.getAllByRole("img", { name: "Unsaved changes" });
  expect(dots).toHaveLength(1);
  expect(screen.getByRole("tab", { name: /two/ }).contains(dots[0])).toBe(true);
});
