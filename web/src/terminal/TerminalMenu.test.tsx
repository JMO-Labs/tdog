import {
  within,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalMenu, type TerminalMenuProps } from "./TerminalMenu";

function setup(over: Partial<TerminalMenuProps> = {}) {
  const props: TerminalMenuProps = {
    x: 40,
    y: 50,
    hasSelection: false,
    themes: [{ id: "a", name: "Alpha" }],
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onSelectAll: vi.fn(),
    onClear: vi.fn(),
    onSplit: vi.fn(),
    onTheme: vi.fn(),
    onRename: vi.fn(),
    onKill: vi.fn(),
    onClose: vi.fn(),
    onDismiss: vi.fn(),
    ...over,
  };
  render(<TerminalMenu {...props} />);
  return props;
}
afterEach(() => vi.restoreAllMocks());

test("opens at the pointer with every item", () => {
  setup();
  const m = screen.getByRole("menu", { name: "Terminal menu" });
  expect(m.style.left).toBe("40px");
  expect(m.style.top).toBe("50px");
  for (const n of [
    "Copy",
    "Paste",
    "Select all",
    "Clear",
    "Split right",
    "Split down",
    "Theme for this terminal",
    "Rename",
    "Kill shell",
    "Close pane",
  ])
    expect(screen.getByRole("menuitem", { name: new RegExp(n) })).toBeTruthy();
});

test("Copy is disabled without a selection", async () => {
  const p = setup({ hasSelection: false });
  expect(
    (screen.getByRole("menuitem", { name: /^Copy/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(p.onCopy).not.toHaveBeenCalled();
});

test("Copy with a selection calls onCopy then dismisses", async () => {
  const p = setup({ hasSelection: true });
  fireEvent.click(screen.getByRole("menuitem", { name: /^Copy/ }));
  expect(p.onCopy).toHaveBeenCalled();
  expect(p.onDismiss).toHaveBeenCalled();
});

test("focuses the first item and arrows navigate", async () => {
  setup({ hasSelection: true });
  const items = screen.getAllByRole("menuitem");
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(items[0], { key: "ArrowDown" });
  expect(document.activeElement).toBe(items[1]);
  fireEvent.keyDown(items[1], { key: "ArrowUp" });
  expect(document.activeElement).toBe(items[0]);
});

test("Esc dismisses", () => {
  const p = setup();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(p.onDismiss).toHaveBeenCalled();
});

test("theme submenu picks a theme and ticks the current one", async () => {
  const p = setup();
  fireEvent.click(
    screen.getByRole("menuitem", { name: /Theme for this terminal/ }),
  );
  const sub = await screen.findByRole("menu", {
    name: "Theme for this terminal",
  });
  // No pane theme yet: "Page default" is the checked radio.
  expect(
    within(sub)
      .getByRole("menuitemradio", { name: "Page default" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(within(sub).getByRole("menuitemradio", { name: "Alpha" }));
  expect(p.onTheme).toHaveBeenCalledWith("a");
});

test("stays inside the viewport", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 200,
    height: 300,
    left: 0,
    top: 0,
    right: 200,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  setup({ x: window.innerWidth - 10, y: window.innerHeight - 10 });
  const m = screen.getByRole("menu", { name: "Terminal menu" });
  await waitFor(() => {
    expect(parseInt(m.style.left)).toBeLessThanOrEqual(window.innerWidth - 200);
    expect(parseInt(m.style.top)).toBeLessThanOrEqual(window.innerHeight - 300);
  });
});

test("clicking outside dismisses", async () => {
  const p = setup();
  fireEvent.pointerDown(document.body);
  expect(p.onDismiss).toHaveBeenCalled();
});

test("only advertises shortcuts that really work (Paste)", () => {
  setup({ hasSelection: true });
  // Strip items show shortcuts in title/tooltip attribute
  const buttons = screen.getAllByRole("menuitem");
  const pasteBtn = buttons.find((el) => el.title?.includes("Paste"));
  const copyBtn = buttons.find((el) => el.title?.includes("Copy"));

  // Paste should have a shortcut in its tooltip (⌘V or Ctrl+Shift+V)
  expect(pasteBtn?.title ?? "").toMatch(/Paste.*(⌘V|Ctrl\+Shift\+V)/);
  // Copy should not have a keyboard shortcut (it's not the native Paste)
  expect(copyBtn?.title ?? "").not.toMatch(/(⌘|Ctrl)/);
});
