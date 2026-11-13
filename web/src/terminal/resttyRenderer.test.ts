import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    term: null as any,
  };
  return state;
});

vi.mock("restty/xterm", () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    data: ((s: string) => void) | null = null;
    resized: ((e: { cols: number; rows: number }) => void) | null = null;
    open = vi.fn();
    write = vi.fn((_s: string, cb?: () => void) => cb?.());
    resize = vi.fn();
    setOption = vi.fn();
    dispose = vi.fn();
    onData(l: (s: string) => void) {
      this.data = l;
      return { dispose() {} };
    }
    onResize(l: (e: { cols: number; rows: number }) => void) {
      this.resized = l;
      return { dispose() {} };
    }
    constructor() {
      h.term = this;
    }
  },
}));

import { ResttyRenderer } from "./resttyRenderer";

const enc = new TextEncoder();

describe("ResttyRenderer", () => {
  let el: HTMLElement;
  let r: ResttyRenderer;
  beforeEach(() => {
    el = document.createElement("div");
    r = new ResttyRenderer(el);
  });

  it("opens in the host element", () => {
    expect(h.term.open).toHaveBeenCalledWith(el);
  });

  it("decodes bytes and fires the write callback (ack)", () => {
    const cb = vi.fn();
    r.write(enc.encode("héllo"), cb);
    expect(h.term.write).toHaveBeenCalledWith("héllo", expect.any(Function));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("keeps split multi-byte sequences across writes", () => {
    const b = enc.encode("é");
    r.write(b.subarray(0, 1));
    r.write(b.subarray(1));
    const s = h.term.write.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(s).toBe("é");
  });

  it("still acks writes that decode to nothing", () => {
    const cb = vi.fn();
    r.write(enc.encode("é").subarray(0, 1), cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("reports size and forwards resize events", () => {
    expect(r.size()).toEqual({ cols: 100, rows: 30 });
    const cb = vi.fn();
    r.onResize(cb);
    h.term.resized({ cols: 90, rows: 20 });
    expect(cb).toHaveBeenCalledWith(90, 20);
  });

  it("resize() is safe (restty self-fits)", () => {
    expect(() => r.resize()).not.toThrow();
  });

  it("encodes input as bytes", () => {
    const cb = vi.fn();
    r.onInput(cb);
    h.term.data("aé");
    expect(cb).toHaveBeenCalledWith(enc.encode("aé"));
  });

  it("sets theme and disposes", () => {
    r.setTheme({ background: "#000" });
    expect(h.term.setOption).toHaveBeenCalledWith("theme", {
      background: "#000",
    });
    r.dispose();
    expect(h.term.dispose).toHaveBeenCalled();
  });
});
