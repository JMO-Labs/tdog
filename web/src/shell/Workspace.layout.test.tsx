import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const killScene = vi.fn();
vi.mock("../terminal/sessions", () => ({
  killScene: (s: string) => killScene(s),
  findSessionId: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: { sceneKey?: string }) => (
    <div data-testid="terminal-pane" data-scene={p.sceneKey} />
  ),
}));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";

beforeEach(() => {
  localStorage.clear();
  killScene.mockClear();
});
afterEach(() => {
  cleanup();
  clearCommands();
});

const scenes = () =>
  screen.getAllByTestId("terminal-pane").map((e) => e.dataset.scene);

test("split right adds a pane with its own session key", () => {
  render(<Workspace />);
  expect(scenes()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Split right" }));
  const s = scenes();
  expect(s).toHaveLength(2);
  expect(new Set(s).size).toBe(2);
});

test("closing panes kills shells; last close shows the empty mascot state", () => {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Split down" }));
  const [first, second] = scenes();
  fireEvent.click(screen.getAllByRole("button", { name: "Close pane" })[0]);
  expect(killScene).toHaveBeenCalledWith(first);
  expect(scenes()).toEqual([second]);
  fireEvent.click(screen.getByRole("button", { name: "Close pane" }));
  expect(killScene).toHaveBeenCalledWith(second);
  expect(screen.getByTestId("empty-panes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New pane" }));
  expect(scenes()).toHaveLength(1);
});

test("layout and pane keys are restored after a reload", () => {
  const a = render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Split right" }));
  const before = scenes();
  a.unmount();
  render(<Workspace />);
  expect(scenes()).toEqual(before);
});
