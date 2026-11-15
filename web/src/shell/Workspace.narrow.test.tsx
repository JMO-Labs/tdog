import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(async () => true),
  findSessionId: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));
vi.mock("../overlays/toast", () => ({ useToast: () => vi.fn() }));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";

const setWidth = (w: number) =>
  vi.stubGlobal("matchMedia", (q: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1] ?? Infinity);
    return {
      matches: w <= max,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  clearCommands();
  vi.unstubAllGlobals();
});

test("390px: header actions collapse into the More menu", () => {
  setWidth(390);
  render(<Workspace />);
  expect(screen.queryByRole("button", { name: "Kill all shells" })).toBeNull();
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  const items = screen.getAllByRole("menuitem").map((e) => e.textContent);
  expect(items).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Studio"),
      expect.stringContaining("Theme"),
      expect.stringContaining("Kill all shells"),
    ]),
  );
  const studio = screen.getByRole("menuitem", { name: /Studio/ });
  expect(studio.getAttribute("aria-disabled")).toBeNull();
});

test("1024px: inline buttons, no More", () => {
  setWidth(1024);
  render(<Workspace />);
  expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  for (const n of ["Studio", "Theme", "Settings", "Kill all shells"])
    expect(screen.getByRole("button", { name: n })).toBeTruthy();
});

test("390px: More menu 'Kill all shells' opens the kill dialog", () => {
  setWidth(390);
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Kill all shells/ }));
  expect(screen.getByRole("button", { name: /hold to nuke/i })).toBeTruthy();
});
