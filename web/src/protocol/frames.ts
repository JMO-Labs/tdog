/** Binary wire protocol (spec §4): 1-byte type prefix, then payload. */
export const FrameType = {
  Output: 0x00,
  Input: 0x01,
  Resize: 0x02,
  Control: 0x03,
} as const;

export type Decoded =
  | { kind: "output"; data: Uint8Array }
  | { kind: "exit"; code: number }
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

export function decodeFrame(buf: ArrayBuffer): Decoded {
  const b = new Uint8Array(buf);
  if (b.length === 0) return { kind: "unknown" };
  if (b[0] === FrameType.Output) return { kind: "output", data: b.subarray(1) };
  if (b[0] === FrameType.Control) {
    try {
      const m = JSON.parse(dec.decode(b.subarray(1)));
      if (m?.type === "exit" && typeof m.code === "number") {
        return { kind: "exit", code: m.code };
      }
    } catch {
      /* fall through */
    }
  }
  return { kind: "unknown" };
}
