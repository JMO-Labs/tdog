import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
import { clearCommands, getCommands } from "../overlays/commands";

beforeEach(() => {
  localStorage.clear();
  killScene.mockClear();
});
afterEach(() => {
  cleanup();
  clearCommands();
});

const tabs = () => screen.getAllByRole("tab").map((t) => t.textContent);
const addBtn = () => screen.getByRole("button", { name: "New scene" });

test("new scene button adds and activates a tab; ⌘T does too", () => {
  render(<Workspace />);
  fireEvent.click(addBtn());
  expect(tabs()).toEqual(["scene 1", "scene 2"]);
  expect(screen.getByRole("tab", { name: "scene 2" }).ariaSelected).toBe(
    "true",
  );
  fireEvent.keyDown(document, { key: "t", metaKey: true });
  expect(tabs()).toHaveLength(3);
});

test("⌘1..⌘9 switch scenes", () => {
  render(<Workspace />);
  fireEvent.click(addBtn());
  fireEvent.keyDown(document, { key: "1", metaKey: true });
  expect(screen.getByRole("tab", { name: "scene 1" }).ariaSelected).toBe(
    "true",
  );
  fireEvent.keyDown(document, { key: "2", ctrlKey: true });
  expect(screen.getByRole("tab", { name: "scene 2" }).ariaSelected).toBe(
    "true",
  );
  fireEvent.keyDown(document, { key: "9", metaKey: true });
  expect(screen.getByRole("tab", { name: "scene 2" }).ariaSelected).toBe(
    "true",
  );
});

test("double-click renames inline; Enter commits, Escape cancels", () => {
  render(<Workspace />);
  fireEvent.doubleClick(screen.getByRole("tab", { name: "scene 1" }));
  const input = screen.getByRole("textbox", { name: "Scene name" });
  fireEvent.change(input, { target: { value: "build" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(tabs()).toEqual(["build"]);
  fireEvent.doubleClick(screen.getByRole("tab", { name: "build" }));
  const i2 = screen.getByRole("textbox", { name: "Scene name" });
  fireEvent.change(i2, { target: { value: "zzz" } });
  fireEvent.keyDown(i2, { key: "Escape" });
  expect(tabs()).toEqual(["build"]);
});

test("background scenes stay mounted", () => {
  render(<Workspace />);
  fireEvent.click(addBtn());
  expect(screen.getAllByTestId("terminal-pane")).toHaveLength(2);
});

test("closing an idle scene needs no confirm and kills its shells", () => {
  render(<Workspace />);
  const first = screen.getAllByTestId("terminal-pane")[0].dataset.scene!;
  fireEvent.click(addBtn());
  fireEvent.click(screen.getByRole("button", { name: "Close scene scene 1" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(tabs()).toEqual(["scene 2"]);
  expect(killScene).toHaveBeenCalledWith(first);
});

test("closing a scene with running shells asks first", () => {
  render(<Workspace />);
  const first = screen.getAllByTestId("terminal-pane")[0].dataset.scene!;
  act(() => opens[first](true));
  fireEvent.click(addBtn());
  fireEvent.click(screen.getByRole("button", { name: "Close scene scene 1" }));
  const dlg = screen.getByRole("dialog", { name: "Close scene 1?" });
  expect(killScene).not.toHaveBeenCalled();
  fireEvent.click(within(dlg).getByRole("button", { name: "Keep" }));
  expect(tabs()).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Close scene scene 1" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Close scene",
    }),
  );
  expect(killScene).toHaveBeenCalledWith(first);
  expect(tabs()).toEqual(["scene 2"]);
});

test("drag reorders tabs", () => {
  render(<Workspace />);
  fireEvent.click(addBtn());
  const [a, b] = screen.getAllByRole("tab");
  fireEvent.dragStart(a);
  fireEvent.dragOver(b);
  fireEvent.drop(b);
  expect(tabs()).toEqual(["scene 2", "scene 1"]);
});

test("scene list persists across reloads", () => {
  const r = render(<Workspace />);
  fireEvent.click(addBtn());
  r.unmount();
  render(<Workspace />);
  expect(tabs()).toEqual(["scene 1", "scene 2"]);
  expect(screen.getByRole("tab", { name: "scene 2" }).ariaSelected).toBe(
    "true",
  );
});

test("every tab has a close button, even the only one", () => {
  render(<Workspace />);
  expect(
    screen.getByRole("button", { name: "Close scene scene 1" }),
  ).toBeTruthy();
});

test("closing the last scene warns with the shell count, kills, and leaves a fresh scene", () => {
  render(<Workspace />);
  const first = screen.getAllByTestId("terminal-pane")[0].dataset.scene!;
  act(() => opens[first](true));
  fireEvent.click(screen.getByRole("button", { name: "Close scene scene 1" }));
  const dlg = screen.getByRole("dialog", { name: "Close scene 1?" });
  expect(dlg.textContent).toContain(
    "Ends 1 shell in it. Unsaved work in them is gone.",
  );
  expect(killScene).not.toHaveBeenCalled();
  fireEvent.click(within(dlg).getByRole("button", { name: "Close scene" }));
  expect(killScene).toHaveBeenCalledWith(first);
  expect(tabs()).toEqual(["scene 1"]);
  const panes = screen.getAllByTestId("terminal-pane");
  expect(panes).toHaveLength(1);
  expect(panes[0].dataset.scene).not.toBe(first);
});

test("tab context menu and palette command close the scene", () => {
  render(<Workspace />);
  fireEvent.click(addBtn());
  fireEvent.contextMenu(screen.getByRole("tab", { name: "scene 1" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Close scene" }));
  expect(tabs()).toEqual(["scene 2"]);
  act(() => {
    getCommands()
      .find((c) => c.id === "scene:close")!
      .run();
  });
  expect(tabs()).toEqual(["scene 1"]);
});
