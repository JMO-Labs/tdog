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
    dispose() {}
  },
}));
vi.mock("./settings/prefs", () => ({
  useMotifOpacity: () => [h.pct, () => {}],
}));
vi.mock("./theme/store", () => ({
  themeStore: {
    terminal: () => ({ background: "#123456" }),
    terminalMotif: () => 'url("data:image/svg+xml,x")',
    effects: () => [{ id: "glyph-rain", intensity: 1 }],
    subscribe: () => () => {},
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

test("glyph-rain behind the text makes the renderer transparent without a motif", async () => {
  render(<TerminalPane />);
  expect(screen.queryByTestId("terminal-motif")).toBeNull();
  await waitFor(() =>
    expect(h.themes.at(-1)).toMatchObject({ background: "rgba(0,0,0,0)" }),
  );
});
