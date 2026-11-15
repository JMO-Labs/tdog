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
  fireEvent.pointerDown(screen.getByRole("button", { name: /hold to nuke/i }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
};

test("kill-all button opens dialog with count, hold kills and toasts", async () => {
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

test("early release does not call the API", async () => {
  render(<Workspace />);
  openAll();
  fireEvent.click(screen.getByRole("button", { name: "Kill all shells" }));
  const b = screen.getByRole("button", { name: /hold to nuke/i });
  fireEvent.pointerDown(b);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  fireEvent.pointerUp(b);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(killScene).not.toHaveBeenCalled();
});

test("cancel closes the kill dialog without killing", async () => {
  vi.useRealTimers();
  render(<Workspace />);
  openAll();
  fireEvent.click(screen.getByRole("button", { name: "Kill all shells" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /hold to nuke/i })).toBeNull(),
  );
  expect(killScene).not.toHaveBeenCalled();
});

test("scene tab menu closes on mouse leave and on blur", () => {
  render(<Workspace />);
  const tab = () => screen.getByRole("tab", { name: "scene 1" });
  fireEvent.contextMenu(tab());
  fireEvent.mouseLeave(screen.getByRole("menu"));
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.contextMenu(tab());
  fireEvent.blur(screen.getByRole("menuitem", { name: "Kill scene" }));
  expect(screen.queryByRole("menu")).toBeNull();
});

test("kill last pane in scene removes scene tab", async () => {
  killScene.mockImplementation(async (paneId: string) => {
    killedPanes.add(paneId);
    return 1;
  });
  render(<Workspace />);
  openAll();
  // Kill all shells to close the only scene and open a new one
  fireEvent.click(screen.getByRole("button", { name: "Kill all shells" }));
  await nuke();
  // Now create a second scene
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  openAll();
  // We should have 2 scenes now
  expect(screen.getByRole("tab", { name: "scene 1" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "scene 2" })).toBeTruthy();
  // Kill the second scene
  fireEvent.click(screen.getByRole("button", { name: "Kill all shells" }));
  await nuke();
  // scene 2 should be gone
  expect(screen.queryByRole("tab", { name: "scene 2" })).toBeNull();
  expect(screen.getByRole("tab", { name: "scene 1" })).toBeTruthy();
});

test("kill all shells closes all scenes and leaves one fresh scene", async () => {
  killScene.mockImplementation(async (paneId: string) => {
    killedPanes.add(paneId);
    return 1;
  });
  render(<Workspace />);
  openAll();
  // Create multiple scenes
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  openAll();
  // We should have 3 scenes now
  expect(screen.getByRole("tab", { name: "scene 1" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "scene 2" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "scene 3" })).toBeTruthy();
  // Kill all shells
  fireEvent.click(screen.getByRole("button", { name: "Kill all shells" }));
  await nuke();
  // Only scene 2 and 3 should be gone (scene 1 is the last scene, so it's kept)
  expect(screen.queryByRole("tab", { name: "scene 2" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "scene 3" })).toBeNull();
  // scene 1 should remain as the fresh scene
  expect(screen.getByRole("tab", { name: "scene 1" })).toBeTruthy();
  // There should be only one scene
  const tabs = screen.getAllByRole("tab");
  expect(tabs.length).toBe(1);
});
