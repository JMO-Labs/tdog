import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const killScene = vi.fn(async (_s: string) => 1);
vi.mock("../terminal/sessions", () => ({
  killScene: (s: string) => killScene(s),
  findSessionId: vi.fn(),
}));
const opens: Record<string, (o: boolean) => void> = {};
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: {
    sceneKey: string;
    onOpenChange: (o: boolean) => void;
  }) => {
    opens[p.sceneKey] = p.onOpenChange;
    return <div data-testid="terminal-pane" />;
  },
}));
const toast = vi.fn();
vi.mock("../overlays/toast", () => ({ useToast: () => toast }));
const killedPanes: Set<string> = new Set();
vi.mock("../terminal/killed", () => ({
  isKilled: (p: string) => killedPanes.has(p),
  markKilled: vi.fn((p: string) => killedPanes.add(p)),
  clearKilled: vi.fn((p: string) => killedPanes.delete(p)),
  subscribeKilled: vi.fn(() => () => {}),
}));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";

beforeEach(() => {
  localStorage.clear();
  killScene.mockClear();
  toast.mockClear();
  killedPanes.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  cleanup();
  clearCommands();
  vi.useRealTimers();
});

const openAll = () => act(() => Object.values(opens).forEach((f) => f(true)));
const nuke = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Nuke" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
};

test("kill-all button opens dialog with count, one click kills and toasts", async () => {
  render(<Workspace />);
  openAll();
  const btn = screen.getByRole("button", { name: "Kill all shells" });
  expect(btn.getAttribute("aria-disabled")).toBeNull();
  fireEvent.click(btn);
  expect(screen.getByText(/1 shell\b/)).toBeTruthy();
  await nuke();
  expect(killScene).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledWith("success", "Killed 1 shell.");
});

test("scene tab menu kills only that scene", async () => {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  openAll();
  fireEvent.contextMenu(screen.getByRole("tab", { name: "scene 1" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Kill scene" }));
  expect(screen.getByText(/1 shell\b/)).toBeTruthy();
  await nuke();
  expect(killScene).toHaveBeenCalledTimes(1);
});

test("cancel closes the kill dialog without killing", async () => {
  vi.useRealTimers();
  render(<Workspace />);
  openAll();
  fireEvent.click(screen.getByRole("button", { name: "Kill all shells" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Nuke" })).toBeNull(),
  );
  expect(killScene).not.toHaveBeenCalled();
});

test("scene tab menu closes on an outside click and when focus leaves it", async () => {
  render(<Workspace />);
  const tab = () => screen.getByRole("tab", { name: "scene 1" });
  fireEvent.contextMenu(tab());
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.contextMenu(tab());
  const item = screen.getByRole("menuitem", { name: "Kill scene" });
  act(() => tab().focus()); // e.g. Tab away
  fireEvent.blur(item);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.queryByRole("menu")).toBeNull();
});
