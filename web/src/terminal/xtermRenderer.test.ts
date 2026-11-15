import { beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({
  term: null as any,
  glFail: false,
  gl: null as any,
  fit: vi.fn(),
  lines: [] as any[],
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
    buffer = { active: { viewportY: 0, cursorX: 0, cursorY: 0, length: 0 } };
    element: HTMLElement | undefined;
    modes = { mouseTrackingMode: "none" };
    loadAddon(a: unknown) {
      this.loaded.push(a);
    }
    onResize(cb: any) {
      this.handlers.resize = cb;
    }
    onData(cb: any) {
      this.handlers.data = cb;
    }
    onTitleChange(cb: any) {
      this.handlers.title = cb;
    }
    parser = {
      registerOscHandler: (id: number, cb: any) => {
        this.handlers["osc" + id] = cb;
      },
    };
    onBinary(cb: any) {
      this.handlers.binary = cb;
    }
    getSelection = vi.fn(() => "");
    selectAll = vi.fn();
    paste = vi.fn();
    focus = vi.fn();
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

test("cursor and font options are applied and refit", () => {
  const r = new XtermRenderer(document.createElement("div"));
  m.fit.mockClear();
  r.setCursor({ shape: "bar", blink: false });
  expect(m.term.options.cursorStyle).toBe("bar");
  expect(m.term.options.cursorBlink).toBe(false);
  r.setFont('"VT323", monospace');
  expect(m.term.options.fontFamily).toBe('"VT323", monospace');
  expect(m.fit).toHaveBeenCalled();
});

test("setFont applies family and size and refits; no-op without args", () => {
  const r = new XtermRenderer(document.createElement("div"));
  m.fit.mockClear();
  r.setFont();
  expect(m.fit).not.toHaveBeenCalled();
  r.setFont("Fira Code");
  expect(m.term.options.fontFamily).toBe("Fira Code");
  expect(m.fit).toHaveBeenCalledTimes(1);
  r.setFont(undefined, 16);
  expect(m.term.options.fontSize).toBe(16);
  expect(m.fit).toHaveBeenCalledTimes(2);
});

test("title and OSC 7 cwd are reported", () => {
  const r = new XtermRenderer(document.createElement("div"));
  const titles: string[] = [];
  const cwds: (string | undefined)[] = [];
  r.onTitle((t) => titles.push(t));
  r.onCwd((c) => cwds.push(c));
  m.term.handlers.title("vim");
  expect(m.term.handlers.osc7("file://h/tmp/a%20b")).toBe(true);
  expect(titles).toEqual(["vim"]);
  expect(cwds).toEqual(["/tmp/a b"]);
});

test("mouseReporting reflects xterm's mouse tracking mode", () => {
  const r = new XtermRenderer(document.createElement("div"));
  m.term.modes = { mouseTrackingMode: "none" };
  expect(r.mouseReporting()).toBe(false);
  m.term.modes = { mouseTrackingMode: "drag" };
  expect(r.mouseReporting()).toBe(true);
});

test("cursorRect maps the cursor cell to viewport coordinates", () => {
  const r = new XtermRenderer(document.createElement("div"));
  const screen = document.createElement("div");
  screen.className = "xterm-screen";
  screen.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 1000, height: 600 }) as DOMRect;
  const el = document.createElement("div");
  el.appendChild(screen);
  m.term.element = el;
  m.term.buffer = {
    active: { cursorX: 5, cursorY: 2, viewportY: 0, length: 100 },
  };
  // cell = 1000/100 x 600/30 = 10 x 20; bottom-left of cell (5,2)
  expect(r.cursorRect()).toEqual({ x: 60, y: 80 });
  m.term.element = undefined;
  expect(r.cursorRect()).toBeNull();
});

test("screenLines returns visible buffer lines with row numbers", () => {
  const r = new XtermRenderer(document.createElement("div"));
  m.term.buffer = {
    active: {
      viewportY: 5,
      length: 100,
      getLine: (y: number) => ({
        translateToString: () => `line ${y}`,
      }),
    },
  };
  m.term.rows = 3;

  const lines = r.screenLines();
  expect(lines).toHaveLength(3);
  expect(lines[0]).toEqual({ row: 0, text: "line 5" });
  expect(lines[1]).toEqual({ row: 1, text: "line 6" });
  expect(lines[2]).toEqual({ row: 2, text: "line 7" });
});

test("screenLines clamps rows to buffer length", () => {
  const r = new XtermRenderer(document.createElement("div"));
  m.term.buffer = {
    active: {
      viewportY: 98,
      length: 100,
      getLine: (y: number) => ({
        translateToString: () => `line ${y}`,
      }),
    },
  };
  m.term.rows = 5; // would be lines 98-102, but buffer ends at 99

  const lines = r.screenLines();
  expect(lines).toHaveLength(2);
  expect(lines[0]).toEqual({ row: 0, text: "line 98" });
  expect(lines[1]).toEqual({ row: 1, text: "line 99" });
});

test("cellGeometry returns calculated cell dimensions and offsets", () => {
  const r = new XtermRenderer(document.createElement("div"));
  const screen = document.createElement("div");
  screen.className = "xterm-screen";
  screen.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 1000, height: 600 }) as DOMRect;
  const el = document.createElement("div");
  el.appendChild(screen);
  m.term.element = el;
  m.term.cols = 100;
  m.term.rows = 30;

  const geom = r.cellGeometry();
  expect(geom).toEqual({
    cellWidth: 10, // 1000 / 100
    cellHeight: 20, // 600 / 30
    offsetX: 10,
    offsetY: 20,
  });
});

test("cellGeometry returns null when screen not found", () => {
  const r = new XtermRenderer(document.createElement("div"));
  m.term.element = undefined;

  expect(r.cellGeometry()).toBeNull();
});

test("cellGeometry returns null when cols or rows is zero", () => {
  const r = new XtermRenderer(document.createElement("div"));
  const screen = document.createElement("div");
  screen.className = "xterm-screen";
  screen.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  const el = document.createElement("div");
  el.appendChild(screen);
  m.term.element = el;
  m.term.cols = 0;
  m.term.rows = 30;

  expect(r.cellGeometry()).toBeNull();
});

test("zoom adds steps to the font size and survives font changes", async () => {
  const { XtermRenderer, zoomed } = await import("./xtermRenderer");
  expect([zoomed(14, 2), zoomed(14, -20), zoomed(14, 99)]).toEqual([16, 6, 40]);
  const r = new XtermRenderer(document.createElement("div"));
  r.setFont(undefined, 14);
  r.setZoom(3);
  expect(m.term.options.fontSize).toBe(17);
  r.setFont(undefined, 12);
  expect(m.term.options.fontSize).toBe(15);
  r.setZoom(0);
  expect(m.term.options.fontSize).toBe(12);
});
