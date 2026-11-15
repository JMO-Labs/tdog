import {
  decodeFrame,
  encodeAck,
  encodeInput,
  encodePing,
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

/** Round-trip probe cadence for the status-bar latency chip. */
export const PING_INTERVAL_MS = 5000;

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
  | { status: "closed"; exitCode?: number; killed?: true };

export interface SessionHooks {
  /** Raw output bytes of one frame. */
  onOutput?: (data: Uint8Array) => void;
  onSize?: (cols: number, rows: number) => void;
  /** Round-trip time in ms from a ping/pong on the control channel. */
  onLatency?: (ms: number) => void;
  /** Called when input is received (for broadcasting). */
  onBroadcast?: (data: Uint8Array) => void;
}

export class TerminalSession {
  private sock: SocketLike | null = null;
  /** True between onopen and onclose; WebSocket.send throws while CONNECTING. */
  private ready = false;
  private pending = 0;
  private exitCode: number | undefined;
  private killed = false;
  private pinger: ReturnType<typeof setInterval> | undefined;

  constructor(
    private r: TerminalRenderer,
    private open: () => SocketLike,
    private onState: (s: SessionState) => void,
    private hooks: SessionHooks = {},
  ) {
    r.onInput((d) => {
      this.send(encodeInput(d));
      this.hooks.onBroadcast?.(d);
    });
    r.onResize((c, rows) => {
      this.send(encodeResize(c, rows));
      this.hooks.onSize?.(c, rows);
    });
  }

  connect(): void {
    this.stopPing();
    this.pending = 0;
    this.exitCode = undefined;
    this.killed = false;
    this.onState({ status: "connecting" });
    const s = this.open();
    this.sock = s;
    this.ready = false;
    s.binaryType = "arraybuffer";
    s.onopen = () => {
      this.ready = true;
      const { cols, rows } = this.r.size();
      s.send(encodeResize(cols, rows));
      this.hooks.onSize?.(cols, rows);
      this.onState({ status: "open" });
      this.ping();
      this.pinger = setInterval(() => this.ping(), PING_INTERVAL_MS);
    };
    s.onmessage = (e) => this.onMessage(e.data);
    s.onclose = () => {
      if (this.sock === s) {
        this.sock = null;
        this.ready = false;
        this.stopPing();
      }
      this.onState(
        this.killed
          ? { status: "closed", killed: true }
          : { status: "closed", exitCode: this.exitCode },
      );
    };
  }

  dispose(): void {
    this.stopPing();
    const s = this.sock;
    this.sock = null;
    if (s) {
      s.onclose = null;
      s.close();
    }
    this.r.dispose();
  }

  private ping(): void {
    this.send(encodePing(performance.now()));
  }

  private stopPing(): void {
    clearInterval(this.pinger);
    this.pinger = undefined;
  }

  private send(f: Uint8Array<ArrayBuffer>): void {
    if (this.ready) this.sock?.send(f);
  }

  private onMessage(buf: ArrayBuffer): void {
    const f = decodeFrame(buf);
    if (f.kind === "exit") {
      this.exitCode = f.code;
    } else if (f.kind === "killed") {
      this.killed = true;
    } else if (f.kind === "pong") {
      this.hooks.onLatency?.(Math.round(performance.now() - f.t));
    } else if (f.kind === "output") {
      const n = f.data.length;
      this.hooks.onOutput?.(f.data);
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
