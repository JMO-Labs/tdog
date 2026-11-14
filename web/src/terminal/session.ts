import {
  decodeFrame,
  encodeAck,
  encodeInput,
  encodeResize,
} from "../protocol/frames";
import type { TerminalRenderer } from "./renderer";

/**
 * Flow control (spec §4). The server pauses PTY reads when unacked bytes exceed
 * HIGH_WATERMARK and resumes below LOW_WATERMARK. The client acks rendered bytes
 * (after `write` callback) in batches of ACK_BATCH_BYTES so acks stay cheap.
 * ACK_BATCH_BYTES must stay well below LOW_WATERMARK.
 */
export const HIGH_WATERMARK = 512 * 1024;
export const LOW_WATERMARK = 128 * 1024;
export const ACK_BATCH_BYTES = 32 * 1024;

export interface SocketLike {
  binaryType: string;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  send(data: Uint8Array<ArrayBuffer>): void;
  close(): void;
}

export type SessionState =
  | { status: "connecting" }
  | { status: "open" }
  | { status: "closed"; exitCode?: number };

export interface SessionHooks {
  onOutput?: () => void;
  onSize?: (cols: number, rows: number) => void;
}

export class TerminalSession {
  private sock: SocketLike | null = null;
  private pending = 0;
  private exitCode: number | undefined;

  constructor(
    private r: TerminalRenderer,
    private open: () => SocketLike,
    private onState: (s: SessionState) => void,
    private hooks: SessionHooks = {},
  ) {
    r.onInput((d) => this.send(encodeInput(d)));
    r.onResize((c, rows) => {
      this.send(encodeResize(c, rows));
      this.hooks.onSize?.(c, rows);
    });
  }

  connect(): void {
    this.pending = 0;
    this.exitCode = undefined;
    this.onState({ status: "connecting" });
    const s = this.open();
    this.sock = s;
    s.binaryType = "arraybuffer";
    s.onopen = () => {
      const { cols, rows } = this.r.size();
      s.send(encodeResize(cols, rows));
      this.hooks.onSize?.(cols, rows);
      this.onState({ status: "open" });
    };
    s.onmessage = (e) => this.onMessage(e.data);
    s.onclose = () => {
      if (this.sock === s) this.sock = null;
      this.onState({ status: "closed", exitCode: this.exitCode });
    };
  }

  dispose(): void {
    const s = this.sock;
    this.sock = null;
    if (s) {
      s.onclose = null;
      s.close();
    }
    this.r.dispose();
  }

  private send(f: Uint8Array<ArrayBuffer>): void {
    this.sock?.send(f);
  }

  private onMessage(buf: ArrayBuffer): void {
    const f = decodeFrame(buf);
    if (f.kind === "exit") {
      this.exitCode = f.code;
    } else if (f.kind === "output") {
      const n = f.data.length;
      this.hooks.onOutput?.();
      this.r.write(f.data, () => this.acked(n));
    }
  }

  private acked(n: number): void {
    this.pending += n;
    if (this.pending >= ACK_BATCH_BYTES) {
      this.send(encodeAck(this.pending));
      this.pending = 0;
    }
  }
}
