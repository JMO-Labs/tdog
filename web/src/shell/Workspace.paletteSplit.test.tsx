import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(),
  findSessionId: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  clearCommands();
});

test("palette 'Split right' adds a pane to the focused scene", async () => {
  render(<Workspace />);
  const panes = () => document.querySelectorAll("[data-pane]").length;
  expect(panes()).toBe(1);
  // Focus the pane so its commands register.
  fireEvent.focus(screen.getByRole("button", { name: "Split down" }));
  await act(async () => {
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  });
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "split right" } });
  const opt = screen.getByRole("option", { name: "Split right" });
  expect(opt.closest("[role=group]")?.getAttribute("aria-label")).toBe(
    "This pane",
  );
  await act(async () => {
    fireEvent.click(opt);
  });
  expect(panes()).toBe(2);
});
