import { afterEach, describe, expect, it, vi } from "vitest";
import { confetti, prefersReducedMotion } from "./confetti";

function fakeCanvas() {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (t[k as string] ??= vi.fn()),
    set: (t, k, v) => ((t[k as string] = v), true),
  });
  return {
    canvas: {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
    } as unknown as HTMLCanvasElement,
    ctx,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("confetti", () => {
  it("is a no-op under reduced motion", () => {
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    const { canvas } = fakeCanvas();
    confetti(canvas, { reduced: true });
    expect(raf).not.toHaveBeenCalled();
    expect(canvas.getContext).not.toHaveBeenCalled();
  });
  it("animates for ~1.6 s then clears", () => {
    let now = 0;
    const q: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      q.push(cb),
    );
    const { canvas, ctx } = fakeCanvas();
    confetti(canvas, { reduced: false, now: () => now });
    let frames = 0;
    while (q.length && frames < 1000) {
      now += 16;
      q.shift()!(now);
      frames++;
    }
    expect(frames).toBeGreaterThan(80);
    expect(frames).toBeLessThan(120);
    expect(ctx.clearRect).toHaveBeenCalled();
  });
});

describe("prefersReducedMotion", () => {
  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
  it.each([true, false])("reflects the media query (matches=%s)", (m) => {
    const mm = vi.fn(() => ({ matches: m }));
    vi.stubGlobal("matchMedia", mm);
    expect(prefersReducedMotion()).toBe(m);
    expect(mm).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });
  it("makes confetti a no-op by default when reduced", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { canvas } = fakeCanvas();
    confetti(canvas);
    expect(canvas.getContext).not.toHaveBeenCalled();
  });
});
