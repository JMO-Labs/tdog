import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";

vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(),
  findSessionId: vi.fn(),
  sessionExists: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: { sceneKey: string }) => (
    <div data-testid="terminal-pane" data-scene={p.sceneKey} />
  ),
}));
vi.mock("../studio/TerminalPreview", () => ({ TerminalPreview: () => null }));

import { Workspace } from "./Workspace";
import { ToastProvider } from "../overlays/toast";
import { clearCommands, getCommands } from "../overlays/commands";

beforeEach(() => {
  localStorage.clear();
  location.hash = "";
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/presets/terminal": json(["api"]),
      "GET /api/presets/terminal/api": new Response('name = "API"\n'),
      "GET /api/schema/terminal": json({}),
      "POST /api/presets/resolve": json({}),
      "GET /api/presets/resolve?terminal=api": json({}),
    }),
  );
});
afterEach(() => {
  cleanup();
  clearCommands();
  vi.unstubAllGlobals();
});

test("Try it in Studio closes Studio and opens a pane with the preset", async () => {
  render(
    <ToastProvider>
      <Workspace />
    </ToastProvider>,
  );
  expect(screen.getAllByTestId("terminal-pane")).toHaveLength(1);
  act(() => {
    getCommands()
      .find((c) => c.id === "studio")!
      .run();
  });
  await screen.findByLabelText("Working directory");
  fireEvent.click(screen.getByRole("button", { name: "Try it" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Studio" })).toBeNull(),
  );
  await waitFor(() =>
    expect(screen.getAllByTestId("terminal-pane")).toHaveLength(2),
  );
});
