import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({
  r: null as any,
  toast: vi.fn(),
}));
vi.mock("./terminal/select", () => ({ pickRenderer: () => "xterm" }));
vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    sel = "";
    mouse = false;
    write = vi.fn();
    resize = vi.fn();
    size = () => ({ cols: 80, rows: 24 });
    onInput = vi.fn();
    onResize = vi.fn();
    setTheme = vi.fn();
    setCursor = vi.fn();
    dispose = vi.fn();
    focus = vi.fn();
    selectAll = vi.fn();
    paste = vi.fn();
    getSelection = () => this.sel;
    mouseReporting = () => this.mouse;
    constructor() {
      m.r = this;
    }
  },
}));
vi.mock("./terminal/session", () => ({
  TerminalSession: class {
    connect() {}
    dispose() {}
  },
}));
vi.mock("./overlays/toast", () => ({ useToast: () => m.toast }));

import { TerminalPane } from "./TerminalPane";

async function mount() {
  render(<TerminalPane />);
  await vi.waitFor(() => expect(m.r).toBeTruthy());
  await new Promise((r) => setTimeout(r, 0));
  return screen.getByTestId("terminal-pane");
}
beforeEach(() => {
  m.r = null;
  m.toast.mockClear();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(), readText: vi.fn() },
  });
});

test("right-click opens the menu at the pointer", async () => {
  const pane = await mount();
  fireEvent.contextMenu(pane, { clientX: 12, clientY: 34 });
  expect(screen.getByRole("menu", { name: "Terminal menu" })).toBeTruthy();
});

test("mouse-reporting apps keep right-clicks; Shift forces the menu", async () => {
  const pane = await mount();
  m.r.mouse = true;
  fireEvent.contextMenu(pane);
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.contextMenu(pane, { shiftKey: true });
  expect(screen.getByRole("menu", { name: "Terminal menu" })).toBeTruthy();
});

test("Copy writes the selection to the clipboard", async () => {
  const pane = await mount();
  m.r.sel = "hello";
  fireEvent.contextMenu(pane);
  fireEvent.click(screen.getByRole("menuitem", { name: /^Copy/ }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
});

test("Shift+F10 opens the menu; Esc closes and refocuses the terminal", async () => {
  const pane = await mount();
  fireEvent.keyDown(pane, { key: "F10", shiftKey: true });
  const menu = screen.getByRole("menu", { name: "Terminal menu" });
  fireEvent.keyDown(menu, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(m.r.focus).toHaveBeenCalled();
});

test("Menu key opens it too", async () => {
  const pane = await mount();
  fireEvent.keyDown(pane, { key: "ContextMenu" });
  expect(screen.getByRole("menu", { name: "Terminal menu" })).toBeTruthy();
});

test("Paste sends clipboard text to the terminal", async () => {
  const pane = await mount();
  (navigator.clipboard.readText as any).mockResolvedValue("ls");
  fireEvent.contextMenu(pane);
  fireEvent.click(screen.getByRole("menuitem", { name: /^Paste/ }));
  await vi.waitFor(() => expect(m.r.paste).toHaveBeenCalledWith("ls"));
});

test("denied paste explains in plain words", async () => {
  const pane = await mount();
  (navigator.clipboard.readText as any).mockRejectedValue(new Error("no"));
  fireEvent.contextMenu(pane);
  fireEvent.click(screen.getByRole("menuitem", { name: /^Paste/ }));
  await vi.waitFor(() =>
    expect(m.toast).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Allow clipboard access"),
    ),
  );
  expect(m.r.paste).not.toHaveBeenCalled();
});
