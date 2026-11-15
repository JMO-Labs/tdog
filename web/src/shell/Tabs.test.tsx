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
const openMenu = (name: string) => {
  fireEvent.contextMenu(screen.getByRole("tab", { name: new RegExp(name) }));
  // wait for menu to render
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
};

test("context menu Kill scene kills that scene and closes the menu", async () => {
  const p = mount();
  await openMenu("beta");
  fireEvent.click(screen.getByRole("menuitem", { name: "Kill scene" }));
  expect(p.onKill).toHaveBeenCalledWith("b");
  expect(p.onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Close scene closes that scene and the menu", async () => {
  const p = mount();
  await openMenu("alpha");
  fireEvent.click(screen.getByRole("menuitem", { name: "Close scene" }));
  expect(p.onClose).toHaveBeenCalledWith("a");
  expect(p.onKill).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("outside click dismisses the menu", async () => {
  mount();
  await openMenu("alpha");
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Save calls onSave with the tab id", async () => {
  const p = mount();
  await openMenu("beta");
  fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));
  expect(p.onSave).toHaveBeenCalledWith("b");
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu Save as… calls onSaveAs with the tab id", async () => {
  const p = mount();
  await openMenu("beta");
  fireEvent.click(screen.getByRole("menuitem", { name: "Save as…" }));
  expect(p.onSaveAs).toHaveBeenCalledWith("b");
  expect(screen.queryByRole("menu")).toBeNull();
});

test("context menu 'New scene from saved…' calls onOpenSaved", async () => {
  const p = mount();
  await openMenu("alpha");
  fireEvent.click(
    screen.getByRole("menuitem", { name: "New scene from saved…" }),
  );
  expect(p.onOpenSaved).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("the dot marks only dirty tabs", () => {
  mount({ dirty: new Set(["b"]) });
  const dots = screen.getAllByRole("img", { name: "Unsaved changes" });
  expect(dots).toHaveLength(1);
  expect(screen.getByRole("tab", { name: /beta/ }).contains(dots[0])).toBe(
    true,
  );
});

test("typing to filter shows matching scene actions", async () => {
  mount();
  await openMenu("alpha");
  const menu = screen.getByRole("menu", { name: "Scene actions" });
  fireEvent.keyDown(menu, { key: "k" });
  const filterInput = screen.getByPlaceholderText(
    "Filter actions",
  ) as HTMLInputElement;
  expect(filterInput.value).toBe("k");
  const items = screen.getAllByRole("menuitem");
  // Should only show Kill scene
  expect(items).toHaveLength(1);
  expect(items[0].textContent).toContain("Kill scene");
});

test("context menu Broadcast to all panes toggles the scene", async () => {
  const onBroadcastAll = vi.fn();
  mount({ onBroadcastAll, broadcastAll: (id) => id === "b" });
  await openMenu("beta");
  const item = screen.getByRole("menuitemradio", {
    name: /Broadcast to all panes/,
  });
  expect(item.getAttribute("aria-checked")).toBe("true");
  expect(item.textContent).toContain("⇧⌘B");
  fireEvent.click(item);
  expect(onBroadcastAll).toHaveBeenCalledWith("b");
});

test("active tab is marked with aria-selected and the underline class", () => {
  mount();
  const a = screen.getByRole("tab", { name: /alpha/ });
  const b = screen.getByRole("tab", { name: /beta/ });
  expect(a.getAttribute("aria-selected")).toBe("true");
  expect(a.classList.contains("on")).toBe(true);
  expect(b.getAttribute("aria-selected")).toBe("false");
  expect(b.classList.contains("on")).toBe(false);
});
