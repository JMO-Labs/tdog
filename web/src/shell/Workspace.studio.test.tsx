import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(async () => true),
  findSessionId: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));
vi.mock("../overlays/toast", () => ({ useToast: () => vi.fn() }));

import { Workspace } from "./Workspace";
import { clearCommands, getCommands } from "../overlays/commands";

const setWidth = (w: number) =>
  vi.stubGlobal("matchMedia", (q: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1] ?? Infinity);
    return {
      matches: w <= max,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

const studio = () => screen.queryByRole("dialog", { name: "Studio" });

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", location.pathname);
});
afterEach(() => {
  cleanup();
  clearCommands();
  vi.unstubAllGlobals();
});

test("the 'Open Studio' command opens Studio", () => {
  render(<Workspace />);
  expect(studio()).toBeNull();
  act(() => {
    getCommands()
      .find((c) => c.id === "studio")!
      .run();
  });
  expect(studio()).not.toBeNull();
});

test("narrow More menu: Studio item opens Studio", () => {
  setWidth(390);
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Studio/ }));
  expect(studio()).not.toBeNull();
});

test("closing Studio returns to the workspace", async () => {
  render(<Workspace />);
  act(() => {
    getCommands()
      .find((c) => c.id === "studio")!
      .run();
  });
  fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
  await waitFor(() => expect(studio()).toBeNull());
});
