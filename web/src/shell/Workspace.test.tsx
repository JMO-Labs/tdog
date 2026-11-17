import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";

let cb: {
  onSize?: (c: number, r: number) => void;
  onOutput?: () => void;
  onLatency?: (ms: number) => void;
  onOpenChange?: (open: boolean) => void;
  reconnectRef?: { current: (() => void) | null };
} = {};
const reconnect = vi.fn();
vi.mock("../studio/TerminalPreview", () => ({ TerminalPreview: () => null }));
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: typeof cb) => {
    cb = p;
    if (p.reconnectRef) p.reconnectRef.current = reconnect;
    return <div data-testid="terminal-pane" />;
  },
}));

// Fake timers freeze motion's exit animation; use a synchronous Sheet stand-in.
vi.mock("../overlays/Sheet", () => ({
  Sheet: (p: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
  }) =>
    p.open ? (
      <div
        role="dialog"
        aria-label={p.title}
        onKeyDown={(e) => e.key === "Escape" && p.onClose()}
      >
        {p.children}
      </div>
    ) : null,
}));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";
import { titleStore } from "../terminal/titles";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 1, 12));
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  clearCommands();
});

test("header: wordmark, tab, one Menu button and Kill", () => {
  render(<Workspace />);
  expect(screen.getByRole("tab", { selected: true })).toBeTruthy();
  const kill = screen.getByRole("button", { name: "Kill all shells" });
  expect(kill.getAttribute("aria-disabled")).toBeNull();
  expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
  for (const n of ["Studio", "Theme", "Settings"])
    expect(screen.queryByRole("button", { name: n })).toBeNull();
});

test("main menu lists grouped items; Appearance submenu sets the mode", () => {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  const names = screen.getAllByRole("menuitem").map((e) => e.textContent ?? "");
  for (const n of ["Theme…", "Appearance", "Studio", "Settings", "Sign out"])
    expect(names.some((t) => t.includes(n))).toBe(true);
  expect(
    screen
      .getByRole("menuitem", { name: /Studio/ })
      .getAttribute("aria-disabled"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Appearance" }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }));
  expect(localStorage.getItem("tdog.theme")).toBe("dark");
});

test("status bar shows live cols×rows and opens palette", () => {
  render(<Workspace />);
  act(() => cb.onSize?.(132, 40));
  expect(screen.getByText("132×40")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
  expect(screen.getByRole("combobox")).toBeTruthy();
});

test("stale pet and dress prefs in storage are ignored", () => {
  localStorage.setItem("tdog.pet", "1");
  localStorage.setItem("tdog.dress", "1");
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Workspace />);
  expect(screen.queryByTestId("pet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  expect(screen.queryByRole("menuitem", { name: /Dogbert/ })).toBeNull();
  expect(err).not.toHaveBeenCalled();
  err.mockRestore();
});

test("closed session shows the empty state", () => {
  render(<Workspace />);
  expect(screen.queryByText("Nothing playing.")).toBeNull();
  act(() => cb.onOpenChange?.(true));
  act(() => cb.onOpenChange?.(false));
  expect(screen.getByText("Nothing playing.")).toBeTruthy();
});

test("palette commands: theme, settings, sign out", async () => {
  const out = vi.fn();
  addEventListener("tdog:signout", out);
  render(<Workspace />);
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
  open();
  fireEvent.click(screen.getByText("Cycle theme"));
  expect(document.documentElement.dataset.theme).toBe("light");
  open();
  fireEvent.click(screen.getByText("Open settings"));
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Settings" }), {
    key: "Escape",
  });
  open();
  await act(async () => {
    fireEvent.click(screen.getByText("Sign out"));
  });
  expect(out).toHaveBeenCalled();
  removeEventListener("tdog:signout", out);
});

test("empty state offers a visible Reconnect action", () => {
  render(<Workspace />);
  act(() => cb.onOpenChange?.(true));
  act(() => cb.onOpenChange?.(false));
  expect(screen.getByText("Nothing playing.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(reconnect).toHaveBeenCalledTimes(1);
});

test("⌘, opens settings", () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("x")));
  render(<Workspace onSignedOut={() => {}} />);
  fireEvent.keyDown(document, { key: ",", metaKey: true });
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
});

test("Settings button opens the sheet; Escape closes it", () => {
  render(<Workspace />);
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Settings/ }));
  const sheet = screen.getByRole("dialog", { name: "Settings" });
  fireEvent.keyDown(sheet, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
});

test("latency chip shows ms, and a dial-up icon above 150 ms", () => {
  render(<Workspace />);
  expect(screen.queryByTestId("latency")).toBeNull();
  act(() => cb.onLatency!(12));
  const chip = screen.getByTestId("latency");
  expect(chip.textContent).toContain("12 ms");
  expect(chip.classList.contains("slow")).toBe(false);
  act(() => cb.onLatency!(412));
  expect(screen.getByTestId("latency").classList.contains("slow")).toBe(true);
  expect(screen.getByTestId("latency").textContent).toContain("412 ms");
  expect(
    screen.getByTestId("latency").querySelector("[data-icon=modem]"),
  ).toBeTruthy();
});

test("palette has one Theme… entry that opens the picker", () => {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
  expect(screen.queryByText(/^Theme: /)).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: /Theme…/ }));
  expect(screen.getByRole("dialog", { name: "Theme" })).toBeTruthy();
});

test("⇧⌘K opens only the kill dialog", () => {
  render(<Workspace />);
  fireEvent.keyDown(document, { key: "K", metaKey: true, shiftKey: true });
  expect(screen.getByText("Kill all shells?")).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: /command palette/i })).toBeNull();
});

// Separate render: motion's exit animation never finishes under fake timers.
test("⌘K opens only the palette, not the kill dialog", () => {
  render(<Workspace />);
  fireEvent.keyDown(document, { key: "k", metaKey: true });
  expect(screen.queryByText("Kill all shells?")).toBeNull();
  expect(screen.getByRole("dialog", { name: /command palette/i })).toBeTruthy();
});

test("⇧⌘M toggles the main menu", () => {
  render(<Workspace />);
  expect(screen.queryByRole("menu", { name: "Main menu" })).toBeNull();
  fireEvent.keyDown(document, { key: "M", metaKey: true, shiftKey: true });
  expect(screen.getByRole("menu", { name: "Main menu" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "M", metaKey: true, shiftKey: true });
  expect(screen.queryByRole("menu", { name: "Main menu" })).toBeNull();
});

// findBy* awaits a setTimeout that vitest fake timers never fire; the
// dialog mounts synchronously inside fireEvent's act(), so query directly.
test("Studio opens from the main menu", () => {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Studio/ }));
  expect(screen.getByRole("dialog", { name: "Studio" })).toBeTruthy();
});

test("⌘. opens Studio", () => {
  render(<Workspace />);
  fireEvent.keyDown(document, { key: ".", metaKey: true });
  expect(screen.getByRole("dialog", { name: "Studio" })).toBeTruthy();
});

test("status bar shows host, shell, size and latency as plain items", () => {
  const { container } = render(<Workspace />);
  act(() => cb.onSize!(80, 24));
  act(() => cb.onLatency!(12));
  const bar = container.querySelector("footer.status")!;
  expect(bar.querySelectorAll(".chip")).toHaveLength(0);
  const pane = container
    .querySelector("[data-pane]")!
    .getAttribute("data-pane")!;
  act(() => titleStore.set(pane, { target: "ssh-host" }));
  expect(bar.textContent).toContain("host");
  expect(bar.textContent).toContain("80×24");
  expect(bar.textContent).toContain("12 ms");
  expect(bar.textContent).toContain("⌘K");
});
