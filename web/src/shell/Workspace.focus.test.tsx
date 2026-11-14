import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

type P = { sceneKey: string; onSize: (c: number, r: number) => void };
const props: Record<string, P> = {};
vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(),
  findSessionId: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: P) => {
    props[p.sceneKey] = p;
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

test("status bar follows the pane that gained focus or pointer", () => {
  const [a, b] = twoPanes();
  act(() => {
    props[a].onSize(80, 24);
    props[b].onSize(100, 30);
  });
  expect(screen.getByText("80×24")).toBeTruthy();
  const paneB = document.querySelector(`[data-pane="${b}"]`)!;
  fireEvent.pointerDown(paneB);
  expect(screen.getByText("100×30")).toBeTruthy();
  const paneA = document.querySelector(`[data-pane="${a}"]`)!;
  fireEvent.focus(paneA);
  expect(screen.getByText("80×24")).toBeTruthy();
});
