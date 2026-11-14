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
vi.mock("./theme/fonts", () => ({
  fontFamily: (id: string) => `fam:${id}`,
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

test("applies cursor at once and the font (refit) only after it loads", async () => {
  render(<TerminalPane />);
  await waitFor(() => expect(h.setCursor).toHaveBeenCalled());
  expect(h.setCursor.mock.calls[0][0]).toMatchObject({
    shape: expect.any(String),
    blink: expect.any(Boolean),
  });
  expect(h.loads.length).toBeGreaterThan(0);
  expect(h.setFont).not.toHaveBeenCalled();
  h.release!();
  await waitFor(() =>
    expect(h.setFont).toHaveBeenCalledWith(`fam:${h.loads[0]}`),
  );
});
