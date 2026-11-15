import { Terminal } from "restty/xterm";
import type { CursorStyle, TerminalRenderer, TerminalTheme } from "./renderer";

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
/** DECSET/DECRST with a mouse-tracking mode (1000/1002/1003) among its params. */
const MOUSE_MODE = /\x1b\[\?([\d;]+)([hl])/g;

export class ResttyRenderer implements TerminalRenderer {
  private term = new Terminal();
  // stream:true carries split multi-byte sequences across write() calls.
  private dec = new TextDecoder("utf-8", { fatal: false });

  private mouse = false;

  constructor(el: HTMLElement) {
    this.term.open(el);
  }

  write(data: Uint8Array, cb?: () => void): void {
    const s = this.dec.decode(data, { stream: true });
    this.trackMouse(s);
    if (s === "") {
      cb?.();
      return;
    }
    this.term.write(s, cb);
  }
  /** restty exposes no mouse mode, so follow DECSET/DECRST in the output. */
  private trackMouse(s: string): void {
    for (const m of s.matchAll(MOUSE_MODE)) {
      if (m[1].split(";").some((n) => ["1000", "1002", "1003"].includes(n)))
        this.mouse = m[2] === "h";
    }
  }
  mouseReporting(): boolean {
    return this.mouse;
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
  setCursor(c: CursorStyle): void {
    this.term.setOption("cursorStyle", c.shape);
    this.term.setOption("cursorBlink", c.blink);
  }
  /** restty observes its container and refits itself after the font changes. */
  setFont(family?: string, size?: number): void {
    if (family) this.term.setOption("fontFamily", family);
    if (size) this.term.setOption("fontSize", size);
  }
  /** restty's xterm-compat surface; each call is guarded in case one is missing. */
  private get compat(): Partial<{
    getSelection(): string;
    selectAll(): void;
    paste(t: string): void;
    focus(): void;
  }> {
    return this.term as never;
  }
  getSelection(): string {
    return this.compat.getSelection?.() ?? "";
  }
  selectAll(): void {
    this.compat.selectAll?.();
  }
  paste(text: string): void {
    this.compat.paste?.(text);
  }
  focus(): void {
    this.compat.focus?.();
  }
  dispose(): void {
    this.term.dispose();
  }
}
