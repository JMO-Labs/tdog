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
import { clearCommands, getCommands } from "../overlays/commands";
import { __clearAllState } from "../broadcast/store";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  clearCommands();
  __clearAllState();
});

function twoPanes() {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Split right" }));
}
const chip = () => screen.queryByText(/Broadcasting to/);

test("shortcut toggles broadcast for every pane; chip x clears it", () => {
  twoPanes();
  expect(chip()).toBeNull();
  fireEvent.keyDown(document, { key: "B", metaKey: true, shiftKey: true });
  expect(chip()?.textContent).toContain("Broadcasting to 2 panes");
  fireEvent.click(screen.getByRole("button", { name: "Stop broadcasting" }));
  expect(chip()).toBeNull();
});

test("command palette entry toggles scene broadcast on and off", () => {
  twoPanes();
  const cmd = () => getCommands().find((c) => c.id === "broadcast:all")!;
  expect(cmd().shortcut).toBe("⇧⌘B");
  act(() => cmd().run());
  expect(chip()?.textContent).toContain("2 panes");
  act(() => cmd().run());
  expect(chip()).toBeNull();
});
