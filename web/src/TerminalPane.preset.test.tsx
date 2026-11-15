import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  themeIds: [] as (string | undefined)[],
  fonts: [] as unknown[],
  urls: [] as string[],
  fontLoaded: null as null | (() => void),
}));

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    onInput() {}
    onResize() {}
    size() {
      return { cols: 80, rows: 24 };
    }
    write() {}
    resize() {}
    setTheme() {}
    setCursor() {}
    setFont(family?: string, size?: number) {
      h.fonts.push([family, size]);
    }
    dispose() {}
  },
}));
vi.mock("./theme/store", () => ({
  themeStore: {
    terminal: (id?: string) => {
      h.themeIds.push(id);
      return { background: "#000" };
    },
    terminalMotif: () => null,
    effects: () => [],
    subscribe: () => () => {},
    paneTheme: (_p?: string, fallback?: string) => fallback,
    scope: () => ({ cursor: { shape: "block", blink: true }, font: "vt323" }),
  },
}));
vi.mock("./theme/fonts", () => ({
  fontFamily: (id: string) => `fam:${id}`,
  loadFont: () =>
    new Promise<void>((res) => {
      h.fontLoaded = res;
    }),
}));
vi.mock("./terminal/sessions", () => ({
  findSessionId: async () => undefined,
  sessionExists: async () => false,
}));
vi.stubGlobal(
  "WebSocket",
  class {
    constructor(url: string) {
      h.urls.push(url);
    }
    send() {}
    close() {}
  },
);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

import { TerminalPane } from "./TerminalPane";

beforeEach(() => {
  localStorage.clear();
  h.themeIds.length = 0;
  h.fonts.length = 0;
  h.urls.length = 0;
  h.fontLoaded = null;
});

const resolved = {
  theme: { value: "mtv-neon", origin: "terminal" },
  "font.family": { value: "Fira Code", origin: "terminal" },
  "font.size": { value: 16, origin: "terminal" },
};

test("preset theme and font apply to that pane only and launch via ?preset=", async () => {
  localStorage.setItem("tdog.panePresets", JSON.stringify({ p1: "app-dev" }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(resolved), { status: 200 })),
  );
  render(<TerminalPane sceneKey="p1" />);
  await waitFor(() => expect(h.themeIds).toContain("mtv-neon"));
  await waitFor(() => expect(h.fonts).toContainEqual(["Fira Code", 16]));
  await waitFor(() => expect(h.urls[0]).toContain("preset=app-dev"));

  h.themeIds.length = 0;
  render(<TerminalPane sceneKey="p2" />);
  await waitFor(() => expect(h.themeIds.length).toBeGreaterThan(0));
  expect(h.themeIds).not.toContain("mtv-neon");
});

test("a preset font family wins over a late-loading theme font", async () => {
  localStorage.setItem("tdog.panePresets", JSON.stringify({ p3: "app-dev" }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(resolved), { status: 200 })),
  );
  render(<TerminalPane sceneKey="p3" />);
  await waitFor(() => expect(h.fonts).toContainEqual(["Fira Code", 16]));
  await waitFor(() => expect(h.fontLoaded).not.toBeNull());
  h.fontLoaded!();
  await new Promise((r) => setTimeout(r, 0));
  expect(h.fonts.at(-1)).toEqual(["Fira Code", 16]);
});
