import { beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({
  term: null as any,
  glFail: false,
  gl: null as any,
  fit: vi.fn(),
}));

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    options: any = {};
    unicode = { activeVersion: "" };
    loaded: unknown[] = [];
    handlers: Record<string, (v: any) => void> = {};
    write = vi.fn();
    dispose = vi.fn();
    open = vi.fn();
    loadAddon(a: unknown) {
      this.loaded.push(a);
    }
    onResize(cb: any) {
      this.handlers.resize = cb;
    }
    onData(cb: any) {
      this.handlers.data = cb;
    }
    onBinary(cb: any) {
      this.handlers.binary = cb;
    }
    constructor() {
      m.term = this;
    }
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = m.fit;
  },
}));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    lossCb: (() => void) | null = null;
    dispose = vi.fn();
    constructor() {
      if (m.glFail) throw new Error("no webgl");
      m.gl = this;
    }
    onContextLoss(cb: () => void) {
      this.lossCb = cb;
    }
  },
}));

import { XtermRenderer } from "./xtermRenderer";

beforeEach(() => {
  m.glFail = false;
  m.gl = null;
  m.fit.mockClear();
});

test("constructor wires addons, opens, fits, and disposes gl on context loss", () => {
  const el = document.createElement("div");
  new XtermRenderer(el);
  expect(m.term.open).toHaveBeenCalledWith(el);
  expect(m.term.unicode.activeVersion).toBe("11");
  expect(m.term.loaded).toContain(m.gl);
  expect(m.fit).toHaveBeenCalledTimes(1);
  m.gl.lossCb();
  expect(m.gl.dispose).toHaveBeenCalled();
});

test("falls back silently when WebGL is unavailable", () => {
  m.glFail = true;
  expect(() => new XtermRenderer(document.createElement("div"))).not.toThrow();
  expect(m.fit).toHaveBeenCalled();
});

test("write, resize, size, theme, dispose delegate to xterm", () => {
  const r = new XtermRenderer(document.createElement("div"));
  const data = new Uint8Array([1]);
  const cb = () => {};
  r.write(data, cb);
  expect(m.term.write).toHaveBeenCalledWith(data, cb);
  m.fit.mockClear();
  r.resize();
  expect(m.fit).toHaveBeenCalledTimes(1);
  expect(r.size()).toEqual({ cols: 100, rows: 30 });
  r.setTheme({ background: "#000" });
  expect(m.term.options.theme).toEqual({ background: "#000" });
  r.dispose();
  expect(m.term.dispose).toHaveBeenCalled();
});

test("input and binary are forwarded as bytes", () => {
  const r = new XtermRenderer(document.createElement("div"));
  const got: number[][] = [];
  r.onInput((d) => got.push([...d]));
  m.term.handlers.data("é");
  m.term.handlers.binary("\x01\xff");
  expect(got).toEqual([
    [0xc3, 0xa9],
    [1, 255],
  ]);
});

test("resize callback fires with cols and rows; no-op before registration", () => {
  const r = new XtermRenderer(document.createElement("div"));
  expect(() => m.term.handlers.resize({ cols: 1, rows: 2 })).not.toThrow();
  const cb = vi.fn();
  r.onResize(cb);
  m.term.handlers.resize({ cols: 90, rows: 20 });
  expect(cb).toHaveBeenCalledWith(90, 20);
});
