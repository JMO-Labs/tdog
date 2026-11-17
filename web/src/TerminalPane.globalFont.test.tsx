import { render, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  setFont: vi.fn(),
  setCursor: vi.fn(),
  release: null as null | (() => void),
  loads: [] as string[],
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
    setCursor = h.setCursor;
    setFont = h.setFont;
    dispose() {}
  },
}));
vi.mock("./presets/api", () => ({
  resolvePreset: (name: string) => {
    h.loads.push(`resolve:${name}`);
    return Promise.resolve({ "font.family": { value: "MesloLGS NF" } });
  },
}));
vi.mock("./theme/serverFonts", () => ({
  whenFamilyReady: () => Promise.resolve(),
}));
vi.mock("./theme/fonts", () => ({
  fontFamily: (id: string) => `fam:${id}`,
  fontScale: () => 1,
  scaledSize: (_id: string, size = 15) => size,
  loadFont: (id: string) => {
    h.loads.push(id);
    return new Promise<void>((r) => (h.release = r));
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

test("a plain pane (no preset) gets config.toml's font family", async () => {
  render(<TerminalPane />);
  await waitFor(() =>
    expect(h.setFont).toHaveBeenCalledWith("MesloLGS NF", undefined),
  );
  expect(h.loads).toContain("resolve:");
});
