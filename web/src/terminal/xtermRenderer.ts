import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { TerminalRenderer, TerminalTheme } from "./renderer";

const enc = new TextEncoder();

export class XtermRenderer implements TerminalRenderer {
  private term = new Terminal({
    allowProposedApi: true,
    cursorBlink: true,
    scrollback: 10000,
  });
  private fit = new FitAddon();
  private resizeCb: ((c: number, r: number) => void) | null = null;

  constructor(el: HTMLElement) {
    const t = this.term;
    t.loadAddon(this.fit);
    t.loadAddon(new Unicode11Addon());
    t.unicode.activeVersion = "11";
    t.open(el);
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => gl.dispose());
      t.loadAddon(gl);
    } catch {
      /* WebGL unavailable: DOM renderer fallback */
    }
    t.onResize(({ cols, rows }) => this.resizeCb?.(cols, rows));
    this.fit.fit();
  }

  write(data: Uint8Array, cb?: () => void): void {
    this.term.write(data, cb);
  }
  resize(): void {
    this.fit.fit();
  }
  size() {
    return { cols: this.term.cols, rows: this.term.rows };
  }
  onInput(cb: (d: Uint8Array) => void): void {
    this.term.onData((s) => cb(enc.encode(s)));
    this.term.onBinary((s) => cb(Uint8Array.from(s, (c) => c.charCodeAt(0))));
  }
  onResize(cb: (c: number, r: number) => void): void {
    this.resizeCb = cb;
  }
  setTheme(theme: TerminalTheme): void {
    this.term.options.theme = theme;
  }
  dispose(): void {
    this.term.dispose();
  }
}
