import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PaneMenu } from "./PaneMenu";

afterEach(cleanup);

function setup() {
  const p = {
    onSwap: vi.fn(),
    onMoveToScene: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
    onSplit: vi.fn(),
    onSnap: vi.fn(() => [] as string[]),
  };
  render(
    <div>
      <PaneMenu id="a" scenes={[{ id: "s2", name: "Two" }]} {...p} />
      <button>outside</button>
    </div>,
  );
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "Pane menu" }));
  return { p, open };
}

test("swap with previous reports -1 and closes the menu", () => {
  const { p, open } = setup();
  open();
  fireEvent.click(screen.getByRole("menuitem", { name: "Swap with previous" }));
  expect(p.onSwap).toHaveBeenCalledWith("a", -1);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("Escape closes the menu; other keys do not", () => {
  const { open } = setup();
  open();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "a" });
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
});

test("focus leaving the menu closes it; focus within keeps it open", () => {
  const { open } = setup();
  open();
  const item = screen.getByRole("menuitem", { name: "Swap with next" });
  fireEvent.blur(item, {
    relatedTarget: screen.getByRole("button", { name: "Pane menu" }),
  });
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.blur(item, { relatedTarget: screen.getByText("outside") });
  expect(screen.queryByRole("menu")).toBeNull();
});

test("menu has a heading, focuses first item, arrows move and wrap", () => {
  const { open } = setup();
  open();
  expect(screen.getByText("Pane actions")).toBeTruthy();
  const items = screen.getAllByRole("menuitem");
  expect(document.activeElement).toBe(items[0]);
  const menu = screen.getByRole("menu");
  fireEvent.keyDown(menu, { key: "ArrowDown" });
  expect(document.activeElement).toBe(items[1]);
  fireEvent.keyDown(menu, { key: "ArrowUp" });
  fireEvent.keyDown(menu, { key: "ArrowUp" });
  expect(document.activeElement).toBe(items[items.length - 1]);
  fireEvent.keyDown(menu, { key: "Home" });
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(menu, { key: "End" });
  expect(document.activeElement).toBe(items[items.length - 1]);
});

test.each([
  ["Rename pane", "onRename", []],
  ["Duplicate pane", "onDuplicate", ["a"]],
  ["Clear scrollback", "onClear", ["a"]],
  ["Close pane", "onClose", ["a"]],
  ["Swap with next", "onSwap", ["a", 1]],
] as const)("%s fires its handler and closes", (name, fn, args) => {
  const { p, open } = setup();
  open();
  fireEvent.click(screen.getByRole("menuitem", { name }));
  expect(p[fn]).toHaveBeenCalledWith(...args);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("Move to scene opens a submenu of scenes; picking one moves the pane", () => {
  const { p, open } = setup();
  open();
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to scene" }));
  const sub = screen.getByRole("menu", { name: "Move to scene" });
  fireEvent.keyDown(sub, { key: "Escape" });
  expect(screen.queryByRole("menu", { name: "Move to scene" })).toBeNull();
  expect(screen.getByRole("menu", { name: "Pane actions" })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to scene" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Two" }));
  expect(p.onMoveToScene).toHaveBeenCalledWith("a", "s2");
});

test("ArrowRight on Move to scene opens the submenu; other keys do not", () => {
  const { open } = setup();
  open();
  const item = screen.getByRole("menuitem", { name: "Move to scene" });
  fireEvent.keyDown(item, { key: "a" });
  expect(screen.queryByRole("menu", { name: "Move to scene" })).toBeNull();
  fireEvent.keyDown(item, { key: "ArrowRight" });
  expect(screen.getByRole("menu", { name: "Move to scene" })).toBeTruthy();
});

test.each([
  ["Split right", ["a", "row"]],
  ["Split down", ["a", "col"]],
] as const)("%s item splits the pane", (name, args) => {
  const { p, open } = setup();
  open();
  fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(name) }));
  expect(p.onSplit).toHaveBeenCalledWith(...args);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("Layouts submenu applies a template; surplus asks to confirm", () => {
  const { p, open } = setup();
  open();
  fireEvent.click(screen.getByRole("menuitem", { name: /Layouts/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "2-up" }));
  expect(p.onSnap).toHaveBeenCalledWith("2-up");
  expect(screen.queryByRole("menu")).toBeNull();
  p.onSnap.mockReturnValueOnce(["x", "y"]);
  open();
  fireEvent.click(screen.getByRole("menuitem", { name: /Layouts/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Single" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Close 2 panes/ }));
  expect(p.onSnap).toHaveBeenLastCalledWith("single", true);
});

test("every former header action is reachable by ArrowDown", () => {
  const { open } = setup();
  open();
  const menu = screen.getByRole("menu", { name: "Pane actions" });
  const seen: string[] = [];
  const count = screen.getAllByRole("menuitem").length;
  for (let k = 0; k < count; k++) {
    seen.push(document.activeElement?.textContent ?? "");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
  }
  for (const n of [
    "Layouts",
    "Split right",
    "Split down",
    "Rename pane",
    "Close pane",
  ])
    expect(seen.some((t) => t.startsWith(n))).toBe(true);
});

test("Layouts opens with ArrowRight and a template applies by keyboard", () => {
  const { p, open } = setup();
  open();
  const item = screen.getByRole("menuitem", { name: /Layouts/ });
  fireEvent.keyDown(item, { key: "ArrowRight" });
  const sub = screen.getByRole("menu", { name: "Layouts" });
  const first = sub.querySelector<HTMLElement>("[role=menuitem]")!;
  first.focus();
  fireEvent.keyDown(first, { key: "Enter" });
  fireEvent.click(first);
  expect(p.onSnap).toHaveBeenCalled();
});

function openLayouts(p: ReturnType<typeof setup>) {
  p.open();
  fireEvent.click(screen.getByRole("menuitem", { name: /Layouts/ }));
}

test("Escape and ArrowLeft close only the Layouts submenu", () => {
  for (const key of ["Escape", "ArrowLeft"]) {
    const s = setup();
    openLayouts(s);
    fireEvent.keyDown(screen.getByRole("menu", { name: "Layouts" }), { key });
    expect(screen.queryByRole("menu", { name: "Layouts" })).toBeNull();
    expect(screen.getByRole("menu")).toBeTruthy();
    cleanup();
  }
});

test("closing the submenu clears a pending confirmation", () => {
  const s = setup();
  s.p.onSnap.mockReturnValueOnce(["x"]);
  openLayouts(s);
  fireEvent.click(screen.getByRole("menuitem", { name: "Single" }));
  expect(
    screen.getByRole("menuitem", { name: /Close 1 pane and/ }),
  ).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("menu", { name: "Layouts" }), {
    key: "Escape",
  });
  fireEvent.click(screen.getByRole("menuitem", { name: /Layouts/ }));
  expect(screen.queryByRole("menuitem", { name: /Close 1 pane/ })).toBeNull();
});

test("Cancel returns from the confirmation to the template list", () => {
  const s = setup();
  s.p.onSnap.mockReturnValueOnce(["x", "y"]);
  openLayouts(s);
  fireEvent.click(screen.getByRole("menuitem", { name: "Single" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));
  expect(screen.getByRole("menuitem", { name: "Single" })).toBeTruthy();
  expect(s.p.onSnap).not.toHaveBeenCalledWith("single", true);
});
