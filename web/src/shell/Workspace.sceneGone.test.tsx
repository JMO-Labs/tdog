import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { markKilled } from "../terminal/killed";

// Real killed store (localStorage + subscribers); only the network is faked.
vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(async (p: string) => {
    markKilled(p);
    return 1;
  }),
  findSessionId: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: { sceneKey: string }) => (
    <div data-testid="terminal-pane" data-key={p.sceneKey} />
  ),
}));
const toast = vi.fn();
vi.mock("../overlays/toast", () => ({ useToast: () => toast }));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";

const leaf = (id: string) => ({ t: "leaf", id });
function seed(layouts: Record<string, unknown>, active = "scene 1") {
  const scenes = Object.keys(layouts).map((id) => ({ id, name: id }));
  localStorage.setItem("tdog.scenes", JSON.stringify({ scenes, active }));
  for (const [id, tree] of Object.entries(layouts))
    localStorage.setItem(`tdog.layout.${id}`, JSON.stringify(tree));
}
const tabs = () => screen.getAllByRole("tab").map((t) => t.textContent ?? "");

beforeEach(() => {
  localStorage.clear();
  toast.mockClear();
});
afterEach(() => {
  cleanup();
  clearCommands();
});

test("killing a scene's only shell (any path) removes its tab", () => {
  seed({ "scene 1": leaf("a"), "scene 2": leaf("b") });
  render(<Workspace />);
  expect(tabs().join()).toContain("scene 2");
  // e.g. right-click "Kill shell", or the server's killed signal
  act(() => markKilled("b"));
  expect(tabs().join()).not.toContain("scene 2");
  expect(tabs().join()).toContain("scene 1");
  expect(toast).toHaveBeenCalledWith(
    "info",
    expect.stringContaining("scene 2"),
  );
});

test("a scene with one live pane left stays", () => {
  seed({
    "scene 1": {
      t: "split",
      id: "s1",
      dir: "row",
      ratio: 0.5,
      a: leaf("a"),
      b: leaf("c"),
    },
    "scene 2": leaf("b"),
  });
  render(<Workspace />);
  act(() => markKilled("a"));
  expect(tabs().join()).toContain("scene 1");
  act(() => markKilled("c"));
  expect(tabs().join()).not.toContain("scene 1");
});

test("killing the last shell of the only scene leaves one fresh scene", () => {
  seed({ "scene 1": leaf("a") });
  render(<Workspace />);
  act(() => markKilled("a"));
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  expect(screen.getAllByTestId("terminal-pane")[0].dataset.key).not.toBe("a");
});

test("a shell that exits on its own keeps the tab", () => {
  seed({ "scene 1": leaf("a"), "scene 2": leaf("b") });
  render(<Workspace />);
  // no kill mark: an exit only shows the ended panel
  expect(tabs()).toHaveLength(2);
});

test("reload after a kill does not bring the tab back", () => {
  seed({ "scene 1": leaf("a"), "scene 2": leaf("b") });
  markKilled("b");
  render(<Workspace />);
  expect(tabs().join()).not.toContain("scene 2");
});
