import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    onInput() {}
    onResize() {}
    size() {
      return { cols: 80, rows: 24 };
    }
    mount() {}
    write() {}
    resize() {}
    setTheme() {}
    dispose() {}
  },
}));

class WS {
  static last: WS;
  binaryType = "";
  onopen = null;
  onmessage = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    WS.last = this;
  }
  send() {}
  close() {}
}
vi.stubGlobal("WebSocket", WS);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

import { App } from "./App";

test("renders the terminal pane and reconnect on close", async () => {
  const { container } = render(<App />);
  expect(container.querySelector("[data-testid=terminal-pane]")).not.toBeNull();
  WS.last.onclose!();
  const btn = await screen.findByRole("button", { name: /reconnect/i });
  expect(btn).toBeTruthy();
});
