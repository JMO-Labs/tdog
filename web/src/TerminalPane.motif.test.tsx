import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ themes: [] as any[], pct: 6 }));

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
    setFont() {}
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
    effects: () => [],
    subscribe: () => () => {},
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

test("motif layer sits under the text host; renderer is transparent", async () => {
  h.pct = 6;
  render(<TerminalPane />);
  const motif = screen.getByTestId("terminal-motif");
  const pane = screen.getByTestId("terminal-pane");
  expect(pane.style.background).toContain("rgb(18, 52, 86)");
  const kids = Array.from(pane.children);
  const host = kids.find((k) => k !== motif && !k.hasAttribute("data-testid"))!;
  expect(kids.indexOf(motif)).toBeLessThan(kids.indexOf(host));
  expect((host as HTMLElement).style.position).toBe("relative");
  await waitFor(() =>
    expect(h.themes.at(-1)).toMatchObject({ background: "rgba(0,0,0,0)" }),
  );
});

test("no motif keeps the opaque renderer background", async () => {
  h.pct = 0;
  h.themes.length = 0;
  render(<TerminalPane />);
  expect(screen.queryByTestId("terminal-motif")).toBeNull();
  await waitFor(() =>
    expect(h.themes.at(-1)).toMatchObject({ background: "#123456" }),
  );
});
