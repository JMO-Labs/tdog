import { render, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  resizes: 0,
  roCb: null as null | (() => void),
  made: 0,
}));

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    constructor() {
      h.made++;
    }
    onInput() {}
    onResize() {}
    size() {
      return { cols: 80, rows: 24 };
    }
    write() {}
    resize() {
      h.resizes++;
    }
    setTheme() {}
    dispose() {}
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
    constructor(cb: () => void) {
      h.roCb = cb;
    }
    observe() {}
    disconnect() {}
  },
);

import { TerminalPane } from "./TerminalPane";

test("defers resize while animating, fits once settled", async () => {
  const { rerender } = render(<TerminalPane settled={false} />);
  await waitFor(() => expect(h.roCb).not.toBeNull());
  h.resizes = 0;
  h.roCb!();
  expect(h.resizes).toBe(0);
  rerender(<TerminalPane settled={true} />);
  expect(h.resizes).toBe(1);
  h.roCb!();
  expect(h.resizes).toBe(2);
});
