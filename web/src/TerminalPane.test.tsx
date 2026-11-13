import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  disconnected: 0,
  sockets: [] as any[],
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
    dispose() {}
  },
}));

class WS {
  binaryType = "";
  onopen = null;
  onmessage = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    h.sockets.push(this);
  }
  send() {}
  close() {}
}
vi.stubGlobal("WebSocket", WS);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {
      h.disconnected++;
    }
  },
);

import { TerminalPane } from "./TerminalPane";

test("unmount disconnects the resize observer", async () => {
  const before = h.disconnected;
  const n = h.sockets.length;
  const { unmount } = render(<TerminalPane />);
  await waitFor(() => expect(h.sockets.length).toBe(n + 1));
  unmount();
  expect(h.disconnected).toBe(before + 1);
});

test("reconnect button opens a new socket", async () => {
  const before = h.sockets.length;
  render(<TerminalPane />);
  await waitFor(() => expect(h.sockets.length).toBe(before + 1));
  const n = h.sockets.length;
  h.sockets[n - 1].onclose!();
  expect(await screen.findByText(/disconnected/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /reconnect/i }));
  expect(h.sockets.length).toBe(n + 1);
});
