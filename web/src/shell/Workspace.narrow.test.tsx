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

test("390px and 1024px keep the same header: Menu + Kill", () => {
  for (const w of [390, 1024]) {
    setWidth(w);
    const { unmount } = render(<Workspace />);
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Kill all shells" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    unmount();
  }
});

test("390px: Menu lists Studio, Settings, Sign out", () => {
  setWidth(390);
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  const studio = screen.getByRole("menuitem", { name: /Studio/ });
  expect(studio.getAttribute("aria-disabled")).toBeNull();
  expect(screen.getByRole("menuitem", { name: /Sign out/ })).toBeTruthy();
});
