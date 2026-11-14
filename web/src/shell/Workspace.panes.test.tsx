import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

type P = {
  sceneKey: string;
  onOpenChange: (o: boolean) => void;
  reconnectRef: { current: (() => void) | null };
};
const props: Record<string, P> = {};
const reconnects: Record<string, ReturnType<typeof vi.fn>> = {};
vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(),
  findSessionId: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: P) => {
    props[p.sceneKey] = p;
    reconnects[p.sceneKey] ??= vi.fn();
    p.reconnectRef.current = reconnects[p.sceneKey];
    return <div data-testid="terminal-pane" />;
  },
}));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  clearCommands();
});

function twoPanes() {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Split right" }));
  const keys = Object.keys(props).filter((k) =>
    document.querySelector(`[data-pane="${k}"]`),
  );
  expect(keys).toHaveLength(2);
  return keys;
}

test("one pane's shell exiting does not cover the healthy pane", () => {
  const [a, b] = twoPanes();
  act(() => {
    props[a].onOpenChange(true);
    props[b].onOpenChange(true);
  });
  expect(screen.queryByText("Nothing playing.")).toBeNull();
  act(() => props[a].onOpenChange(false));
  const overlays = screen.getAllByText("Nothing playing.");
  expect(overlays).toHaveLength(1);
  const paneB = document.querySelector(`[data-pane="${b}"]`)!;
  expect(paneB.textContent).not.toContain("Nothing playing.");
});

test("reconnect targets its own pane after another pane is closed", () => {
  const [a, b] = twoPanes();
  act(() => {
    props[a].onOpenChange(true);
    props[b].onOpenChange(true);
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Close pane" })[0]);
  act(() => props[b].onOpenChange(false));
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(reconnects[b]).toHaveBeenCalledTimes(1);
  expect(reconnects[a]).not.toHaveBeenCalled();
});
