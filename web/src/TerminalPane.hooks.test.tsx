import { render, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  sockets: [] as any[],
  resizeCb: null as null | ((c: number, r: number) => void),
  setTheme: vi.fn(),
}));

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    onInput() {}
    onResize(cb: (c: number, r: number) => void) {
      h.resizeCb = cb;
    }
    size() {
      return { cols: 80, rows: 24 };
    }
    write() {}
    resize() {}
    setTheme(t: unknown) {
      h.setTheme(t);
    }
    dispose() {}
  },
}));
vi.stubGlobal(
  "WebSocket",
  class {
    binaryType = "";
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() {
      h.sockets.push(this);
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
import { themeStore } from "./theme/store";

test("forwards session size and output events to the onSize/onOutput props", async () => {
  const onSize = vi.fn();
  const onOutput = vi.fn();
  render(<TerminalPane onSize={onSize} onOutput={onOutput} />);
  await waitFor(() => expect(h.sockets.length).toBe(1));
  h.resizeCb!(100, 30);
  expect(onSize).toHaveBeenCalledWith(100, 30);
  h.sockets[0].onmessage!({ data: new Uint8Array([0x00, 0x68]).buffer });
  expect(onOutput).toHaveBeenCalledTimes(1);
});

test("re-applies the terminal theme when the theme store changes", async () => {
  render(<TerminalPane />);
  await waitFor(() => expect(h.sockets.length).toBeGreaterThan(0));
  h.setTheme.mockClear();
  themeStore.select("night-market");
  expect(h.setTheme).toHaveBeenCalledWith(themeStore.terminal());
  themeStore.reset();
});
