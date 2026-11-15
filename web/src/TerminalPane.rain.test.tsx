import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ themes: [] as any[], pct: 0 }));

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    onInput() {}
    onResize() {}
    size() {
      return { cols: 80, rows: 24 };
    }
    write() {}
    resize() {}
    setTheme(t: unknown) {
      h.themes.push(t);
    }
    setCursor() {}
    dispose() {}
  },
}));
vi.mock("./settings/prefs", () => ({
  useMotifOpacity: () => [h.pct, () => {}],
  usePref: () => [false, () => {}],
}));
vi.mock("./theme/store", () => ({
  themeStore: {
    terminal: () => ({ background: "#123456" }),
    terminalMotif: () => 'url("data:image/svg+xml,x")',
    effects: () => [{ id: "glyph-rain", intensity: 1 }],
    subscribe: () => () => {},
    paneTheme: (_p?: string, fallback?: string) => fallback,
    scope: () => ({
      cursor: { shape: "block", blink: true },
      font: "jetbrains-mono",
    }),
  },
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
import { SceneArtContext } from "./terminal/useSceneArt";

test("glyph-rain behind the text makes the renderer transparent without a motif", async () => {
  render(
    <SceneArtContext.Provider value={true}>
      <TerminalPane />
    </SceneArtContext.Provider>,
  );
  expect(screen.queryByTestId("terminal-motif")).toBeNull();
  await waitFor(() =>
    expect(h.themes.at(-1)).toMatchObject({ background: "rgba(0,0,0,0)" }),
  );
});
