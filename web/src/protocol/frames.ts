import type { JournalEvent } from "../journal/types";

/** Binary wire protocol (spec §4): 1-byte type prefix, then payload. */
export const FrameType = {
  Output: 0x00,
  Input: 0x01,
  Resize: 0x02,
  Control: 0x03,
  Journal: 0x04,
} as const;

export type Decoded =
  | { kind: "output"; data: Uint8Array }
  | { kind: "exit"; code: number }
  | { kind: "killed" }
  | { kind: "pong"; t: number }
  | { kind: "journal"; events: JournalEvent[] }
  | { kind: "unknown" };

const enc = new TextEncoder();
const dec = new TextDecoder();

function frame(type: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const f = new Uint8Array(payload.length + 1);
  f[0] = type;
  f.set(payload, 1);
  return f;
}

export function encodeInput(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return frame(FrameType.Input, data);
}

/** Payload: cols u16 BE, rows u16 BE. */
export function encodeResize(
  cols: number,
  rows: number,
): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(4);
  const v = new DataView(p.buffer);
  v.setUint16(0, cols);
  v.setUint16(2, rows);
  return frame(FrameType.Resize, p);
}

/** Flow-control ack: bytes the client has finished rendering. */
export function encodeAck(bytes: number): Uint8Array<ArrayBuffer> {
  return frame(
    FrameType.Control,
    enc.encode(JSON.stringify({ type: "ack", bytes })),
  );
}

/** Latency probe; the server echoes `t` back in a pong. */
export function encodePing(t: number): Uint8Array<ArrayBuffer> {
  return frame(
    FrameType.Control,
    enc.encode(JSON.stringify({ type: "ping", t })),
  );
}

function control(m: object): Uint8Array<ArrayBuffer> {
  return frame(FrameType.Control, enc.encode(JSON.stringify(m)));
}

/** Tell the server everything up to `seq` is saved in the browser. */
export const encodeJournalAck = (seq: number) =>
  control({ type: "jrnl-ack", seq });
export const encodeJournalRecord = (on: boolean) =>
  control({ type: "jrnl-record", on });
export const encodeJournalForget = () => control({ type: "jrnl-forget" });

export function decodeFrame(buf: ArrayBuffer): Decoded {
  const b = new Uint8Array(buf);
  if (b.length === 0) return { kind: "unknown" };
  if (b[0] === FrameType.Output) return { kind: "output", data: b.subarray(1) };
  if (b[0] === FrameType.Journal) {
    try {
      const m = JSON.parse(dec.decode(b.subarray(1)));
      if (Array.isArray(m)) return { kind: "journal", events: m };
    } catch {
      /* fall through */
    }
  }
  if (b[0] === FrameType.Control) {
    try {
      const m = JSON.parse(dec.decode(b.subarray(1)));
      if (m?.type === "exit" && typeof m.code === "number") {
        return { kind: "exit", code: m.code };
      }
      if (m?.type === "killed") return { kind: "killed" };
      if (m?.type === "pong" && typeof m.t === "number") {
        return { kind: "pong", t: m.t };
      }
    } catch {
      /* fall through */
    }
  }
  return { kind: "unknown" };
}
