import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../TerminalPane", () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";
import { themeStore } from "../theme/store";

beforeEach(() => {
  localStorage.clear();
  themeStore.reset();
});
afterEach(() => {
  cleanup();
  clearCommands();
});

test("main menu 'Theme…' opens the theme picker", () => {
  render(<Workspace />);
  expect(screen.queryByRole("searchbox", { name: "Filter themes" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Theme…/ }));
  expect(screen.getByRole("searchbox", { name: "Filter themes" })).toBeTruthy();
});
