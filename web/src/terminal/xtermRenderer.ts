import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { ImageAddon } from "@xterm/addon-image";
import { cwdFromOsc7 } from "./titles";
import type {
  CellGeometry,
  CursorStyle,
  ScreenLine,
  TerminalRenderer,
  TerminalTheme,
} from "./renderer";

const enc = new TextEncoder();

export class XtermRenderer implements TerminalRenderer {
  private term = new Terminal({
    allowProposedApi: true,
    allowTransparency: true, // motif / glyph-rain paint behind the text
    cursorBlink: true,
    scrollback: 10000,
  });
  private fit = new FitAddon();
  private resizeCb: ((c: number, r: number) => void) | null = null;
  private imageAddon: ImageAddon | null = null;

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

  async setInlineImages(enabled: boolean): Promise<void> {
    const t = this.term;
    if (enabled && !this.imageAddon) {
      try {
        const { ImageAddon } = await import("@xterm/addon-image");
        const img = new ImageAddon();
        // Lower storageLimit for many panes (default 128 MB -> 32 MB)
        img.storageLimit = 32 * 1024 * 1024; // 32 MB
        t.loadAddon(img);
        this.imageAddon = img;
      } catch (e) {
        console.warn("Failed to load image addon:", e);
      }
    } else if (!enabled && this.imageAddon) {
      this.imageAddon.dispose();
      this.imageAddon = null;
    }
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
  onTitle(cb: (title: string) => void): void {
    this.term.onTitleChange(cb);
  }
  onCwd(cb: (cwd: string) => void): void {
    this.term.parser.registerOscHandler(7, (data) => {
      const cwd = cwdFromOsc7(data);
      if (cwd) cb(cwd);
      return true;
    });
  }
  setTheme(theme: TerminalTheme): void {
    this.term.options.theme = theme;
  }
  setCursor(c: CursorStyle): void {
    this.term.options.cursorStyle = c.shape;
    this.term.options.cursorBlink = c.blink;
  }
  setFont(family?: string, size?: number): void {
    if (family) this.term.options.fontFamily = family;
    if (size) this.term.options.fontSize = size;
    if (family || size) this.fit.fit();
  }
  getSelection(): string {
    return this.term.getSelection();
  }
  selectAll(): void {
    this.term.selectAll();
  }
  paste(text: string): void {
    this.term.paste(text);
  }
  focus(): void {
    this.term.focus();
  }
  cursorRect(): { x: number; y: number } | null {
    const screen = this.term.element?.querySelector(".xterm-screen");
    if (!screen) return null;
    const b = screen.getBoundingClientRect();
    const { cols, rows } = this.term;
    if (!cols || !rows) return null;
    const { cursorX, cursorY } = this.term.buffer.active;
    return {
      x: b.left + (cursorX * b.width) / cols,
      y: b.top + ((cursorY + 1) * b.height) / rows,
    };
  }
  mouseReporting(): boolean {
    return this.term.modes.mouseTrackingMode !== "none";
  }
  screenLines(): ScreenLine[] {
    const lines: ScreenLine[] = [];
    const buffer = this.term.buffer.active;
    const startRow = buffer.viewportY;
    const endRow = Math.min(startRow + this.term.rows, buffer.length);
    for (let y = startRow; y < endRow; y++) {
      const line = buffer.getLine(y);
      if (line) {
        const text = line.translateToString(true);
        lines.push({ row: y - startRow, text });
      }
    }
    return lines;
  }
  cellGeometry(): CellGeometry | null {
    const screen = this.term.element?.querySelector(".xterm-screen");
    if (!screen) return null;
    const { cols, rows } = this.term;
    if (!cols || !rows) return null;
    const b = screen.getBoundingClientRect();
    return {
      cellWidth: b.width / cols,
      cellHeight: b.height / rows,
      offsetX: b.left,
      offsetY: b.top,
    };
  }
  dispose(): void {
    if (this.imageAddon) {
      try {
        this.imageAddon.dispose();
      } catch {
        /* Addon already disposed */
      }
    }
    this.term.dispose();
  }
}
