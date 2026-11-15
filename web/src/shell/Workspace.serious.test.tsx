import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../TerminalPane", () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));

import { Workspace } from "./Workspace";
import { clearCommands, getCommands } from "../overlays/commands";
import { themeStore } from "../theme/store";
import { getPref, setPref } from "../settings/prefs";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 1, 12));
  localStorage.clear();
  themeStore.reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clearCommands();
});

test("serious hides the pet; off brings it back", () => {
  render(<Workspace />);
  expect(screen.getByTestId("pet")).toBeTruthy();
  act(() => setPref("serious", true));
  expect(screen.queryByTestId("pet")).toBeNull();
  act(() => setPref("serious", false));
  expect(screen.getByTestId("pet")).toBeTruthy();
});

test("menu toggle and ⌘K command switch serious live", () => {
  render(<Workspace />);
  const item = () => {
    if (!screen.queryByRole("menuitem", { name: /Serious mode/ }))
      act(() => screen.getByRole("button", { name: "Menu" }).click());
    return screen.getByRole("menuitem", { name: /Serious mode/ });
  };
  expect(item().textContent).toContain("Off");
  act(() => item().click());
  expect(getPref("serious")).toBe(true);
  expect(item().textContent).toContain("On");
  expect(document.documentElement.dataset.serious).toBe("1");
  expect(getCommands().some((c) => c.id.startsWith("theme:"))).toBe(false);
  act(() =>
    getCommands()
      .find((c) => c.id === "serious")!
      .run(),
  );
  expect(getPref("serious")).toBe(false);
  expect(getCommands().some((c) => c.id === "theme:plain")).toBe(true);
});
