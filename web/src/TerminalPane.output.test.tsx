import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  sockets: [] as any[],
  toast: vi.fn(),
}));

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    onInput() {}
    onResize() {}
    size() {
      return { cols: 80, rows: 24 };
    }
    write(_d: Uint8Array, done?: () => void) {
      done?.();
    }
    resize() {}
    setTheme() {}
    dispose() {}
  },
}));
vi.mock("./overlays/toast", () => ({ useToast: () => h.toast }));

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

const output = (...b: number[]) => new Uint8Array([0x00, ...b]).buffer;
const pong = (t: number) =>
  new Uint8Array([
    0x03,
    ...new TextEncoder().encode(`{"type":"pong","t":${t}}`),
  ]).buffer;

async function mount(props: Parameters<typeof TerminalPane>[0] = {}) {
  const n = h.sockets.length;
  render(<TerminalPane {...props} />);
  await waitFor(() => expect(h.sockets.length).toBe(n + 1));
  return h.sockets[n];
}

test("output and latency frames reach the pane hooks", async () => {
  const onOutput = vi.fn();
  const onLatency = vi.fn();
  const sock = await mount({ onOutput, onLatency });
  act(() => sock.onopen!());
  act(() => sock.onmessage!({ data: output(65) }));
  act(() => sock.onmessage!({ data: pong(performance.now()) }));
  expect(onOutput).toHaveBeenCalledTimes(1);
  expect(onLatency).toHaveBeenCalledTimes(1);
});

test("toasts once the replay after a reconnect goes quiet", async () => {
  h.toast.mockClear();
  const first = await mount();
  act(() => first.onopen!());
  act(() => first.onclose!());
  fireEvent.click(await screen.findByRole("button", { name: /reconnect/i }));
  const second = h.sockets[h.sockets.length - 1];
  act(() => second.onopen!());
  // static (400ms) then rewinding; output keeps the replay going until quiet.
  await screen.findByText("Rewinding…", {}, { timeout: 3000 });
  act(() => second.onmessage!({ data: output(66) }));
  await waitFor(
    () =>
      expect(h.toast).toHaveBeenCalledWith(
        "success",
        "Reconnected. Scrollback replayed.",
      ),
    { timeout: 3000 },
  );
});
