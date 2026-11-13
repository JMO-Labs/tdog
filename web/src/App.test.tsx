import { render, screen, waitFor } from "@testing-library/react";
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
  await waitFor(() => expect(WS.last).toBeDefined());
  WS.last.onclose!();
  const btn = await screen.findByRole("button", { name: /reconnect/i });
  expect(btn).toBeTruthy();
});

test("?renderer=restty mounts the restty renderer", async () => {
  vi.resetModules();
  const made: string[] = [];
  vi.doMock("./terminal/resttyRenderer", () => ({
    ResttyRenderer: class {
      constructor() {
        made.push("restty");
      }
      onInput() {}
      onResize() {}
      size() {
        return { cols: 80, rows: 24 };
      }
      write() {}
      resize() {}
      setTheme() {}
      dispose() {}
    },
  }));
  window.history.pushState({}, "", "/?renderer=restty");
  const { TerminalPane } = await import("./TerminalPane");
  render(<TerminalPane />);
  await waitFor(() => expect(made).toEqual(["restty"]));
  window.history.pushState({}, "", "/");
});
