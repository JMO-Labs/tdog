import { Terminal } from "restty/xterm";
import type { TerminalRenderer, TerminalTheme } from "./renderer";

/**
 * restty (libghostty-vt + WebGPU) behind the TerminalRenderer adapter.
 *
 * Flow-control ack strategy: TerminalSession counts bytes handed to `write` and
 * acks them (in ACK_BATCH_BYTES batches, see session.ts) only after the `cb`
 * fires. restty's xterm-compat `write(str, cb)` invokes `cb` once the data is
 * parsed, so the ack tracks processing, not receipt. `cb` is ALWAYS called,
 * even when a chunk decodes to an empty string (partial UTF-8 sequence), so
 * acked byte counts never drift from what the server sent.
 */
const enc = new TextEncoder();

export class ResttyRenderer implements TerminalRenderer {
  private term = new Terminal();
  // stream:true carries split multi-byte sequences across write() calls.
  private dec = new TextDecoder("utf-8", { fatal: false });

  constructor(el: HTMLElement) {
    this.term.open(el);
  }

  write(data: Uint8Array, cb?: () => void): void {
    const s = this.dec.decode(data, { stream: true });
    if (s === "") {
      cb?.();
      return;
    }
    this.term.write(s, cb);
  }
  /** restty observes its container and refits itself; nothing to do. */
  resize(): void {}
  size() {
    return { cols: this.term.cols, rows: this.term.rows };
  }
  onInput(cb: (d: Uint8Array) => void): void {
    this.term.onData((s) => cb(enc.encode(s)));
  }
  onResize(cb: (c: number, r: number) => void): void {
    this.term.onResize(({ cols, rows }) => cb(cols, rows));
  }
  setTheme(theme: TerminalTheme): void {
    this.term.setOption("theme", theme);
  }
  dispose(): void {
    this.term.dispose();
  }
}
