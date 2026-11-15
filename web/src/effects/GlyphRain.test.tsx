import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { GlyphRain } from "./GlyphRain";

afterEach(() => vi.unstubAllGlobals());

test("paints glyphs on frames, refits on resize, cleans up on unmount", () => {
  const ctx = {
    clearRect: vi.fn(),
    fillText: vi.fn(),
    font: "",
    fillStyle: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as never,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(64);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(32);
  vi.spyOn(Math, "random").mockReturnValue(0); // every column drops at once
  let cb: ((t: number) => void) | null = null;
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => {
    cb = f;
    return 7;
  });
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  let refit: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(f: () => void) {
        refit = f;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const { container, unmount } = render(<GlyphRain intensity={1} />);
  expect(container.querySelector("canvas")!.width).toBe(64);
  cb!(100); // first frame: starts a drop (random 0 < 0.01 on negative y)
  expect(ctx.clearRect).toHaveBeenCalled();
  cb!(110); // under FRAME_MS: skipped
  expect(ctx.clearRect).toHaveBeenCalledTimes(1);
  for (let t = 200; t < 200 + 80 * 10; t += 80) cb!(t); // run past the bottom
  expect(ctx.fillText).toHaveBeenCalled();
  refit();
  unmount();
  expect(cancel).toHaveBeenCalledWith(7);
  expect(disconnect).toHaveBeenCalled();
  vi.restoreAllMocks();
});
