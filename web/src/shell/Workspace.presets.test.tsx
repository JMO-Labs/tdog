import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json } from "../auth/testutil";

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

import { Workspace } from "./Workspace";
import { ToastProvider } from "../overlays/toast";
import { clearCommands } from "../overlays/commands";

type Call = { method: string; url: string; body?: unknown };
let calls: Call[] = [];
let routes: Record<string, () => Response> = {};
beforeEach(() => {
  localStorage.clear();
  calls = [];
  routes = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body });
      const h = routes[`${method} ${url}`];
      if (!h) throw new Error(`unmocked ${method} ${url}`);
      return h();
    }),
  );
});
afterEach(() => {
  cleanup();
  clearCommands();
  vi.unstubAllGlobals();
});

const mount = () =>
  render(
    <ToastProvider>
      <Workspace />
    </ToastProvider>,
  );
const runCommand = async (title: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
  await act(async () => {
    fireEvent.click(screen.getByText(title));
  });
};
const panes = () =>
  screen.getAllByTestId("terminal-pane").map((p) => p.dataset.scene);

test("New pane from preset… lists terminal presets and opens a pane with it", async () => {
  routes["GET /api/presets/terminal"] = () => json(["app-dev", "logs"]);
  routes["GET /api/presets/resolve?terminal=app-dev"] = () => json({});
  mount();
  expect(panes()).toHaveLength(1);
  await runCommand("New pane from preset…");
  const btn = await screen.findByRole("button", { name: "app-dev" });
  await act(async () => {
    fireEvent.click(btn);
  });
  await waitFor(() => expect(panes()).toHaveLength(2));
  const map = JSON.parse(localStorage.getItem("tdog.panePresets") ?? "{}");
  expect(Object.values(map)).toEqual(["app-dev"]);
  expect(panes()).toContain(Object.keys(map)[0]);
});

test("a rejected preset toasts the server message naming the field", async () => {
  routes["GET /api/presets/terminal"] = () => json(["bad"]);
  routes["GET /api/presets/resolve?terminal=bad"] = () =>
    json({ error: "font.size: must be positive" }, 400);
  mount();
  await runCommand("New pane from preset…");
  const btn = await screen.findByRole("button", { name: "bad" });
  await act(async () => {
    fireEvent.click(btn);
  });
  expect(await screen.findByText("font.size: must be positive")).toBeTruthy();
  expect(panes()).toHaveLength(1);
  expect(localStorage.getItem("tdog.panePresets")).toBeNull();
});

test("Open scene preset… starts it in a new scene tab", async () => {
  routes["GET /api/presets/scene"] = () => json(["dev"]);
  routes["POST /api/scenes/dev/start"] = () =>
    json({
      scene: "sc-1",
      name: "dev",
      existing: false,
      panes: [
        { pane: "a", session: "s-a" },
        { pane: "b", session: "s-b" },
      ],
      layout: {
        type: "split",
        dir: "row",
        ratio: 0.5,
        a: { type: "pane", pane: "a" },
        b: { type: "pane", pane: "b" },
      },
    });
  mount();
  await runCommand("Open scene preset…");
  const btn = await screen.findByRole("button", { name: "dev" });
  await act(async () => {
    fireEvent.click(btn);
  });
  const tab = await screen.findByRole("tab", { name: "dev" });
  expect(tab.ariaSelected).toBe("true");
  await waitFor(() => expect(panes()).toHaveLength(3)); // 1 in scene 1 + 2 new
  expect(calls.some((c) => c.method === "POST")).toBe(true);
});

test("start errors toast the server message", async () => {
  routes["GET /api/presets/scene"] = () => json(["dev"]);
  routes["POST /api/scenes/dev/start"] = () =>
    new Response("panes[1]: unknown preset\n", { status: 400 });
  mount();
  await runCommand("Open scene preset…");
  const btn = await screen.findByRole("button", { name: "dev" });
  await act(async () => {
    fireEvent.click(btn);
  });
  expect(await screen.findByText("panes[1]: unknown preset")).toBeTruthy();
  expect(screen.getAllByRole("tab")).toHaveLength(1);
});

test("Save scene as… writes layout and pane presets", async () => {
  localStorage.setItem(
    "tdog.layout.scene 1",
    JSON.stringify({ t: "leaf", id: "p1" }),
  );
  localStorage.setItem("tdog.panePresets", JSON.stringify({ p1: "app-dev" }));
  routes["PUT /api/presets/scene/mine"] = () =>
    new Response(null, { status: 204 });
  mount();
  routes["GET /api/presets/scene"] = () => json([]);
  await runCommand("Save scene as…");
  fireEvent.change(screen.getByLabelText("Preset name"), {
    target: { value: "mine" },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
  const put = calls.find((c) => c.method === "PUT")!;
  expect(put.body).toContain('pane = "p1"');
  expect(put.body).toContain('[[panes]]\nid = "p1"\npreset = "app-dev"');
  expect(await screen.findByText('Saved scene preset "mine".')).toBeTruthy();
});

test("save validation errors toast the server message", async () => {
  routes["PUT /api/presets/scene/bad"] = () =>
    json({ error: "layout.ratio: must be between 0.1 and 0.9" }, 400);
  mount();
  routes["GET /api/presets/scene"] = () => json([]);
  await runCommand("Save scene as…");
  fireEvent.change(screen.getByLabelText("Preset name"), {
    target: { value: "bad" },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
  expect(
    await screen.findByText("layout.ratio: must be between 0.1 and 0.9"),
  ).toBeTruthy();
});

test("empty-pane state lists terminal presets; picking one opens a pane", async () => {
  localStorage.setItem("tdog.layout.scene 1", "null");
  routes["GET /api/presets/terminal"] = () => json(["app-dev"]);
  routes["GET /api/presets/resolve?terminal=app-dev"] = () => json({});
  mount();
  expect(screen.getByTestId("empty-panes")).toBeTruthy();
  const btn = await screen.findByRole("button", { name: "app-dev" });
  await act(async () => {
    fireEvent.click(btn);
  });
  await waitFor(() => expect(panes()).toHaveLength(1));
  const map = JSON.parse(localStorage.getItem("tdog.panePresets") ?? "{}");
  expect(Object.values(map)).toEqual(["app-dev"]);
});
