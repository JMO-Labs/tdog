import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";

let cb: {
  onSize?: (c: number, r: number) => void;
  onOutput?: () => void;
  onOpenChange?: (open: boolean) => void;
  reconnectRef?: { current: (() => void) | null };
} = {};
const reconnect = vi.fn();
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: typeof cb) => {
    cb = p;
    if (p.reconnectRef) p.reconnectRef.current = reconnect;
    return <div data-testid="terminal-pane" />;
  },
}));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  clearCommands();
});

test("header: wordmark, one tab, icon buttons with disabled ones", () => {
  render(<Workspace onSignedOut={() => {}} />);
  expect(screen.getByRole("tab", { selected: true })).toBeTruthy();
  const studio = screen.getByRole("button", { name: "Studio" });
  expect(studio.getAttribute("aria-disabled")).toBe("true");
  const kill = screen.getByRole("button", { name: "Kill all shells" });
  expect(kill.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("button", { name: "Theme" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
});

test("status bar shows live cols×rows and opens palette", () => {
  render(<Workspace onSignedOut={() => {}} />);
  act(() => cb.onSize?.(132, 40));
  expect(screen.getByText("132×40")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
  expect(screen.getByRole("combobox")).toBeTruthy();
});

test("pet sleeps after 3s idle, wakes on output, click hides", () => {
  render(<Workspace onSignedOut={() => {}} />);
  const pet = () => screen.getByTestId("pet");
  act(() => cb.onOutput?.());
  expect(pet().className).toContain("awake");
  act(() => void vi.advanceTimersByTime(3600));
  expect(pet().className).toContain("sleep");
  act(() => cb.onOutput?.());
  act(() => void vi.advanceTimersByTime(600));
  expect(pet().className).toContain("awake");
  fireEvent.click(pet());
  expect(screen.queryByTestId("pet")).toBeNull();
});

test("closed session shows the empty state", () => {
  render(<Workspace onSignedOut={() => {}} />);
  expect(screen.queryByText("Nothing playing.")).toBeNull();
  act(() => cb.onOpenChange?.(true));
  act(() => cb.onOpenChange?.(false));
  expect(screen.getByText("Nothing playing.")).toBeTruthy();
});

test("palette commands: theme, settings, sign out", async () => {
  vi.stubGlobal("fetch", mockFetch({ "POST /api/logout": json({}) }));
  const out = vi.fn();
  render(<Workspace onSignedOut={out} />);
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
  open();
  fireEvent.click(screen.getByText("Cycle theme"));
  expect(document.documentElement.dataset.theme).toBe("light");
  open();
  fireEvent.click(screen.getByText("Open Settings"));
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  open();
  await act(async () => {
    fireEvent.click(screen.getByText("Sign out"));
  });
  expect(out).toHaveBeenCalled();
});

test("empty state offers a visible Reconnect action", () => {
  render(<Workspace onSignedOut={() => {}} />);
  act(() => cb.onOpenChange?.(true));
  act(() => cb.onOpenChange?.(false));
  expect(screen.getByText("Nothing playing.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(reconnect).toHaveBeenCalledTimes(1);
});

test("Settings button opens the sheet; Escape closes it", () => {
  render(<Workspace onSignedOut={() => {}} />);
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
});
