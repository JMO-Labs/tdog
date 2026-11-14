import { describe, expect, test, vi } from "vitest";
import { FrameType } from "../protocol/frames";
import type { TerminalRenderer } from "./renderer";
import {
  ACK_BATCH_BYTES,
  PING_INTERVAL_MS,
  TerminalSession,
  type SocketLike,
} from "./session";

class FakeSocket implements SocketLike {
  binaryType = "";
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(d: Uint8Array) {
    this.sent.push(d);
  }
  close() {}
}

function mockRenderer() {
  const r = {
    input: null as null | ((d: Uint8Array) => void),
    resized: null as null | ((c: number, r: number) => void),
    write: vi.fn((_d: Uint8Array, cb?: () => void) => cb?.()),
    resize: vi.fn(),
    size: vi.fn(() => ({ cols: 80, rows: 24 })),
    onInput(cb: (d: Uint8Array) => void) {
      r.input = cb;
    },
    onResize(cb: (c: number, r: number) => void) {
      r.resized = cb;
    },
    setTheme: vi.fn(),
    dispose: vi.fn(),
  };
  return r satisfies TerminalRenderer & Record<string, unknown>;
}

function setup() {
  const sock = new FakeSocket();
  const r = mockRenderer();
  const onState = vi.fn();
  const s = new TerminalSession(r, () => sock, onState);
  s.connect();
  return { sock, r, s, onState };
}

const out = (...b: number[]) => new Uint8Array([FrameType.Output, ...b]).buffer;

describe("TerminalSession", () => {
  test("sends initial size on open", () => {
    const { sock } = setup();
    sock.onopen!();
    expect([...sock.sent[0]]).toEqual([FrameType.Resize, 0, 80, 0, 24]);
  });

  test("forwards input as input frames", () => {
    const { sock, r } = setup();
    sock.onopen!();
    r.input!(new Uint8Array([65]));
    expect([...sock.sent.at(-1)!]).toEqual([FrameType.Input, 65]);
  });

  test("forwards renderer resize as resize frame", () => {
    const { sock, r } = setup();
    sock.onopen!();
    r.resized!(100, 30);
    expect([...sock.sent.at(-1)!]).toEqual([FrameType.Resize, 0, 100, 0, 30]);
  });

  test("writes output and acks after write callback, batched", () => {
    const { sock, r } = setup();
    sock.onopen!();
    const n0 = sock.sent.length;
    sock.onmessage!({ data: out(1, 2, 3) });
    expect(r.write).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      expect.any(Function),
    );
    expect(sock.sent.length).toBe(n0); // below batch: no ack yet
    sock.onmessage!({ data: out(...new Array(ACK_BATCH_BYTES).fill(0)) });
    const ack = sock.sent.at(-1)!;
    expect(ack[0]).toBe(FrameType.Control);
    expect(JSON.parse(new TextDecoder().decode(ack.subarray(1)))).toEqual({
      type: "ack",
      bytes: ACK_BATCH_BYTES + 3,
    });
  });

  test("does not ack until the write callback fires", () => {
    const { sock, r } = setup();
    r.write.mockImplementation(() => {});
    sock.onopen!();
    const n0 = sock.sent.length;
    sock.onmessage!({ data: out(...new Array(ACK_BATCH_BYTES).fill(0)) });
    expect(sock.sent.length).toBe(n0);
  });

  test("exit frame then close reports exited state with code", () => {
    const { sock, onState } = setup();
    sock.onopen!();
    const body = new TextEncoder().encode('{"type":"exit","code":7}');
    sock.onmessage!({
      data: new Uint8Array([FrameType.Control, ...body]).buffer,
    });
    sock.onclose!();
    expect(onState).toHaveBeenLastCalledWith({ status: "closed", exitCode: 7 });
  });

  test("close without exit has undefined code; reconnect opens new socket", () => {
    const socks: FakeSocket[] = [];
    const s = new TerminalSession(
      mockRenderer(),
      () => {
        const k = new FakeSocket();
        socks.push(k);
        return k;
      },
      () => {},
    );
    s.connect();
    socks[0].onclose!();
    s.connect();
    expect(socks.length).toBe(2);
  });

  test("dispose disposes renderer", () => {
    const { s, r } = setup();
    s.dispose();
    expect(r.dispose).toHaveBeenCalled();
  });
});

describe("TerminalSession hooks", () => {
  test("reports size on open/resize and output", () => {
    const sock = new FakeSocket();
    const r = mockRenderer();
    const hooks = { onSize: vi.fn(), onOutput: vi.fn() };
    new TerminalSession(r, () => sock, vi.fn(), hooks).connect();
    sock.onopen?.();
    expect(hooks.onSize).toHaveBeenCalledWith(80, 24);
    r.resized?.(100, 30);
    expect(hooks.onSize).toHaveBeenCalledWith(100, 30);
    sock.onmessage?.({ data: out(65) });
    expect(hooks.onOutput).toHaveBeenCalledTimes(1);
  });
});

describe("latency ping", () => {
  const pong = (t: number) => {
    const b = new TextEncoder().encode(JSON.stringify({ type: "pong", t }));
    return new Uint8Array([FrameType.Control, ...b]).buffer;
  };
  const pings = (sock: FakeSocket) =>
    sock.sent.filter(
      (f) =>
        f[0] === FrameType.Control &&
        new TextDecoder().decode(f.subarray(1)).includes('"ping"'),
    );

  test("pings on open and every interval; pong reports round-trip", () => {
    vi.useFakeTimers();
    try {
      let now = 1000;
      vi.spyOn(performance, "now").mockImplementation(() => now);
      const sock = new FakeSocket();
      const onLatency = vi.fn();
      const s = new TerminalSession(mockRenderer(), () => sock, vi.fn(), {
        onLatency,
      });
      s.connect();
      sock.onopen!();
      expect(pings(sock)).toHaveLength(1);
      now = 1042.4;
      sock.onmessage!({ data: pong(1000) });
      expect(onLatency).toHaveBeenCalledWith(42);
      vi.advanceTimersByTime(PING_INTERVAL_MS);
      expect(pings(sock)).toHaveLength(2);
      sock.onclose!();
      vi.advanceTimersByTime(PING_INTERVAL_MS * 2);
      expect(pings(sock)).toHaveLength(2);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
