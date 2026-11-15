import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const killScene = vi.fn();
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
    return <div data-testid="terminal-pane" data-scene={p.sceneKey} />;
  },
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

const tabs = () => screen.getAllByRole("tab").map((t) => t.textContent);

test("blurring the rename input commits the new name", () => {
  render(<Workspace />);
  fireEvent.doubleClick(screen.getByRole("tab", { name: "scene 1" }));
  const input = screen.getByRole("textbox", { name: "Scene name" });
  fireEvent.change(input, { target: { value: "blurred" } });
  fireEvent.blur(input);
  expect(tabs()).toEqual(["blurred"]);
  expect(screen.queryByRole("textbox", { name: "Scene name" })).toBeNull();
});

test("clicking a tab selects that scene", () => {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  expect(screen.getByRole("tab", { name: "scene 2" }).ariaSelected).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("tab", { name: "scene 1" }));
  expect(screen.getByRole("tab", { name: "scene 1" }).ariaSelected).toBe(
    "true",
  );
});

test("Escape on the close-scene dialog keeps the scene", async () => {
  render(<Workspace />);
  const first = screen.getAllByTestId("terminal-pane")[0].dataset.scene!;
  act(() => opens[first](true));
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  fireEvent.click(screen.getByRole("button", { name: "Close scene scene 1" }));
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Close scene 1?" }), {
    key: "Escape",
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(killScene).not.toHaveBeenCalled();
  expect(tabs()).toHaveLength(2);
});
