import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";

vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(),
  findSessionId: vi.fn(),
  sessionExists: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));
vi.mock("../studio/TerminalPreview", () => ({ TerminalPreview: () => null }));

import { Workspace } from "./Workspace";
import { ToastProvider } from "../overlays/toast";
import { clearCommands, getCommands } from "../overlays/commands";

const stored = [
  'name = "dev"',
  "",
  "[layout]",
  'type = "pane"',
  'pane = "s1"',
  "",
  "[[panes]]",
  'id = "s1"',
  'preset = "api"',
  "",
].join("\n");

beforeEach(() => {
  localStorage.clear();
  location.hash = "";
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/presets/terminal": json(["api"]),
      "GET /api/presets/terminal/api": new Response('name = "API"\n'),
      "GET /api/presets/scene": json(["dev"]),
      "GET /api/presets/scene/dev": new Response(stored),
      "GET /api/schema/terminal": json({}),
      "POST /api/presets/resolve": json({}),
      "GET /api/presets/resolve?terminal=api": json({}),
      "PUT /api/presets/scene/dev": () => new Response(null, { status: 204 }),
      "POST /api/scenes/dev/start": json({
        scene: "dev",
        name: "dev",
        existing: false,
        panes: [{ pane: "s1", session: "sess-1" }],
      }),
    }),
  );
});
afterEach(() => {
  cleanup();
  clearCommands();
  vi.unstubAllGlobals();
});

test("Open scene in Studio launches the scene in a new tab and closes Studio", async () => {
  render(
    <ToastProvider>
      <Workspace />
    </ToastProvider>,
  );
  const tabs = () => screen.getAllByRole("tab").length;
  const before = tabs();
  act(() => {
    getCommands()
      .find((c) => c.id === "studio")!
      .run();
  });
  const nav = within(screen.getByRole("navigation", { name: "Studio" }));
  fireEvent.click(nav.getByRole("button", { name: "Scene design" }));
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  await screen.findByLabelText("Scene name");
  fireEvent.click(screen.getByRole("button", { name: "Open scene" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Studio" })).toBeNull(),
  );
  expect(tabs()).toBe(before + 1);
  expect(screen.getByRole("tab", { name: "dev" })).toBeTruthy();
});
