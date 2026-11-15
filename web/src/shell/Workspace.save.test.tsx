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
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));

import { Workspace } from "./Workspace";
import { ToastProvider } from "../overlays/toast";
import { clearCommands } from "../overlays/commands";
import { saveLayout } from "../layout/store";
import { titleStore } from "../terminal/titles";

type Tree = Parameters<typeof saveLayout>[1];
const split = (ratio: number, title?: string): Tree => ({
  t: "split",
  id: "s",
  dir: "row",
  ratio,
  a: { t: "leaf", id: "p1", title },
  b: { t: "leaf", id: "p2" },
});

let calls: { method: string; url: string }[] = [];
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
beforeEach(() => {
  localStorage.clear();
  titleStore.clear();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (method === "PUT") return new Response(null, { status: 204 });
      if (url === "/api/presets/scene") return json([]);
      throw new Error(`unmocked ${method} ${url}`);
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
const link = () =>
  localStorage.setItem("tdog.scenePresets", '{"scene 1":"mine"}');
const puts = () => calls.filter((c) => c.method === "PUT");
const dots = () => screen.queryAllByRole("img", { name: "Unsaved changes" });
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document, { key: "s", ...init });
  });

test("Ctrl+S saves a linked tab without asking", async () => {
  saveLayout("scene 1", split(0.5));
  link();
  mount();
  await press({ ctrlKey: true });
  expect(puts().map((c) => c.url)).toEqual(["/api/presets/scene/mine"]);
  expect(screen.queryByLabelText("Preset name")).toBeNull();
});

test("Cmd+S on an unlinked tab opens the name dialog", async () => {
  saveLayout("scene 1", split(0.5));
  mount();
  await press({ metaKey: true });
  expect(await screen.findByLabelText("Preset name")).toBeTruthy();
  expect(puts()).toHaveLength(0);
});

test("main menu Save scene / Save scene as… (narrow)", async () => {
  setWidth(390);
  saveLayout("scene 1", split(0.5));
  link();
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  await act(async () => {
    fireEvent.click(
      screen.getByRole("menuitem", { name: /^Save scene(?! as)/ }),
    );
  });
  expect(puts()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: /^Save scene as…/ }));
  });
  expect(await screen.findByLabelText("Preset name")).toBeTruthy();
});

test("unsaved dot appears on a split ratio change and clears on Save", async () => {
  saveLayout("scene 1", split(0.5));
  link();
  mount();
  await press({ ctrlKey: true });
  expect(dots()).toHaveLength(0);
  act(() => saveLayout("scene 1", split(0.7)));
  await waitFor(() => expect(dots()).toHaveLength(1));
  await press({ ctrlKey: true });
  await waitFor(() => expect(dots()).toHaveLength(0));
});

test("unsaved dot appears on a title change and on a cwd change", async () => {
  saveLayout("scene 1", split(0.5));
  titleStore.set("p1", { cwd: "/a" });
  link();
  mount();
  await press({ ctrlKey: true });
  expect(dots()).toHaveLength(0);
  act(() => saveLayout("scene 1", split(0.5, "api")));
  await waitFor(() => expect(dots()).toHaveLength(1));
  act(() => saveLayout("scene 1", split(0.5)));
  await waitFor(() => expect(dots()).toHaveLength(0));
  act(() => titleStore.set("p1", { cwd: "/b" }));
  await waitFor(() => expect(dots()).toHaveLength(1));
});
