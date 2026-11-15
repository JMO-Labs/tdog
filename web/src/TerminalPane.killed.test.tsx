import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ sockets: [] as any[] }));

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
    setCursor() {}
    setFont() {}
    dispose() {}
  },
}));
vi.mock("./presets/panes", () => ({
  panePreset: () => undefined,
  resolveSession: async () => undefined,
}));

class WS {
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
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
    disconnect() {}
  },
);

import { TerminalPane } from "./TerminalPane";
import { isKilled } from "./terminal/killed";

afterEach(() => {
  localStorage.clear();
  h.sockets.length = 0;
  vi.useRealTimers();
});

const ctl = (o: object) =>
  new Uint8Array([3, ...new TextEncoder().encode(JSON.stringify(o))]).buffer;

test("killed frame shows the panel and never reconnects", async () => {
  render(<TerminalPane sceneKey="k1" />);
  await waitFor(() => expect(h.sockets.length).toBe(1));
  vi.useFakeTimers();
  act(() => {
    h.sockets[0].onopen!();
    h.sockets[0].onmessage!({ data: ctl({ type: "killed" }) });
    h.sockets[0].onclose!();
  });
  expect(screen.getByText("Shell killed")).toBeTruthy();
  expect(isKilled("k1")).toBe(true);
  act(() => void vi.advanceTimersByTime(10000));
  expect(h.sockets.length).toBe(1);
});

test("reload of a killed pane opens no socket until the button", async () => {
  localStorage.setItem("tdog.killedPanes", JSON.stringify({ k2: true }));
  render(<TerminalPane sceneKey="k2" />);
  expect(screen.getByText("Shell killed")).toBeTruthy();
  await new Promise((r) => setTimeout(r, 50));
  expect(h.sockets.length).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Start a new shell" }));
  await waitFor(() => expect(h.sockets.length).toBe(1));
  expect(isKilled("k2")).toBe(false);
});

test("exited shell shows its code in the styled panel", async () => {
  render(<TerminalPane sceneKey="k3" />);
  await waitFor(() => expect(h.sockets.length).toBe(1));
  act(() => {
    h.sockets[0].onopen!();
    h.sockets[0].onmessage!({ data: ctl({ type: "exit", code: 3 }) });
    h.sockets[0].onclose!();
  });
  expect(screen.getByText("Shell exited with code 3")).toBeTruthy();
  expect(isKilled("k3")).toBe(false);
});
