import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ConnectionGag } from "./ConnectionGag";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("live renders nothing", () => {
  const { container } = render(
    <ConnectionGag phase="live" onReconnect={() => {}} />,
  );
  expect(container.firstChild).toBeNull();
});

test("tracking shows copy and a working sticker Reconnect", () => {
  const onReconnect = vi.fn();
  render(<ConnectionGag phase="tracking" onReconnect={onReconnect} />);
  expect(screen.getByText("Adjusting tracking…")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(onReconnect).toHaveBeenCalled();
});

test("static draws a canvas", () => {
  const { container } = render(
    <ConnectionGag phase="static" onReconnect={() => {}} />,
  );
  expect(container.querySelector("canvas.static")).toBeTruthy();
});

test("rewinding shows copy", () => {
  render(<ConnectionGag phase="rewinding" onReconnect={() => {}} />);
  expect(screen.getByText("Rewinding…")).toBeTruthy();
});

test("reduced motion marks overlays still", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const { container } = render(
    <ConnectionGag phase="tracking" onReconnect={() => {}} />,
  );
  expect(container.querySelector(".vhs")!.classList.contains("still")).toBe(
    true,
  );
});

function stubCanvas() {
  const ctx = {
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as never,
  );
  return ctx;
}

test("static paints noise, animates per frame and cancels on unmount", () => {
  const ctx = stubCanvas();
  let cb: FrameRequestCallback = () => {};
  const raf = vi.fn((f: FrameRequestCallback) => {
    cb = f;
    return 7;
  });
  const caf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const { unmount } = render(
    <ConnectionGag phase="static" onReconnect={() => {}} />,
  );
  expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  const img = ctx.putImageData.mock.calls[0][0];
  expect(img.data[3]).toBe(255);
  cb(0);
  expect(ctx.putImageData).toHaveBeenCalledTimes(2);
  expect(raf).toHaveBeenCalledTimes(2);
  unmount();
  expect(caf).toHaveBeenCalledWith(7);
});

test("static under reduced motion paints one frame and never animates", () => {
  const ctx = stubCanvas();
  const raf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(<ConnectionGag phase="static" onReconnect={() => {}} />);
  expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  expect(raf).not.toHaveBeenCalled();
});
