import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

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
    setFont() {}
    dispose() {}
  },
}));
vi.mock("./theme/store", () => ({
  themeStore: {
    get: () => ({ id: "plain" }),
    terminal: () => ({ background: "#000" }),
    terminalMotif: () => null,
    effects: () => [],
    subscribe: () => () => {},
    paneTheme: (_p?: string, fallback?: string) => fallback,
    scope: () => ({ cursor: { shape: "block", blink: true }, font: "vt323" }),
  },
}));
vi.mock("./theme/fonts", () => ({
  fontScale: () => 1,
  scaledSize: (_id: string, size?: number) => size,
  fontFamily: (id: string) => id,
  loadFont: async () => {},
}));
vi.mock("./terminal/sessions", () => ({
  findSessionId: async () => undefined,
  sessionExists: async () => false,
}));
vi.stubGlobal(
  "WebSocket",
  class {
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
import { SceneBgContext } from "./backgrounds/SceneBackground";
import { setPref } from "./settings/prefs";

const resolved = {
  "background.kind": { value: "color", origin: "terminal" },
  "background.ref": { value: "#336699", origin: "terminal" },
  "background.opacity": { value: 0.6, origin: "terminal" },
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("tdog.panePresets", JSON.stringify({ p1: "neon" }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(resolved), { status: 200 })),
  );
});

test("a preset background renders behind the terminal with its opacity", async () => {
  render(<TerminalPane sceneKey="p1" sceneId="test-scene" />);
  const layer = await screen.findByTestId("bg-layer");
  expect(layer.style.opacity).toBe("0.6");
  const pane = screen.getByTestId("terminal-pane");
  expect(pane.firstElementChild).toBe(layer);
});

test("performance mode drops the pane background", async () => {
  setPref("perf", true);
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  render(<TerminalPane sceneKey="p1" sceneId="test-scene" />);
  await waitFor(() => expect(f).toHaveBeenCalled());
  expect(screen.queryByTestId("bg-layer")).toBeNull();
});

test("under a scene background the pane fill turns transparent", () => {
  render(
    <SceneBgContext.Provider value={true}>
      <TerminalPane />
    </SceneBgContext.Provider>,
  );
  expect(screen.getByTestId("terminal-pane").style.background).toBe(
    "transparent",
  );
});
