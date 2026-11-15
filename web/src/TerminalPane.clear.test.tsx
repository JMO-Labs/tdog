import { render, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  sockets: [] as any[],
  resizeCb: null as null | ((c: number, r: number) => void),
  setTheme: vi.fn(),
  write: vi.fn(),
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
    write(d: Uint8Array) {
      h.write(d);
    }
    resize() {}
    setTheme(t: unknown) {
      h.setTheme(t);
    }
    setCursor() {}
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
import { clearScrollback } from "./terminal/paneActions";

test("a pane with a sceneKey registers a clear that writes ED 3 to the renderer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
  const { unmount } = render(
    <TerminalPane sceneKey="scene-clear" sceneId="test-scene" />,
  );
  await waitFor(() => expect(clearScrollback("scene-clear")).toBe(true));
  const sent = new TextDecoder().decode(h.write.mock.calls.at(-1)![0]);
  expect(sent).toBe("\x1b[3J");
  unmount();
  expect(clearScrollback("scene-clear")).toBe(false);
});
