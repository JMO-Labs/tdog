import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BackgroundLayer } from "./BackgroundLayer";
import { setPref } from "../settings/prefs";

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();
let io: (e: { isIntersecting: boolean }[]) => void = () => {};

beforeEach(() => {
  localStorage.clear();
  play.mockClear();
  pause.mockClear();
  HTMLMediaElement.prototype.play = play;
  HTMLMediaElement.prototype.pause = pause;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof io) {
        io = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const video = { kind: "video", ref: "v1", opacity: 0.7, blur: 3 } as const;

test("renders a color layer with opacity", () => {
  render(
    <BackgroundLayer
      spec={{ kind: "color", ref: "#123", opacity: 0.5, blur: 0 }}
    />,
  );
  expect(screen.getByTestId("bg-layer").style.opacity).toBe("0.5");
});

test("video plays, then pauses when the tab is hidden", () => {
  render(<BackgroundLayer spec={video} />);
  expect(play).toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", {
    value: "hidden",
    configurable: true,
  });
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
  expect(pause).toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
});

test("video pauses when scrolled off-screen", () => {
  render(<BackgroundLayer spec={video} />);
  pause.mockClear();
  act(() => io([{ isIntersecting: false }]));
  expect(pause).toHaveBeenCalled();
});

test("observer attaches when the spec arrives after mount", () => {
  const { rerender } = render(<BackgroundLayer spec={null} />);
  rerender(<BackgroundLayer spec={video} />);
  pause.mockClear();
  act(() => io([{ isIntersecting: false }]));
  expect(pause).toHaveBeenCalled();
});

test("performance mode draws nothing", () => {
  setPref("perf", true);
  render(<BackgroundLayer spec={video} />);
  expect(screen.queryByTestId("bg-layer")).toBeNull();
});

test("gif is dropped while the tab is hidden so it stops animating", () => {
  render(
    <BackgroundLayer
      spec={{ kind: "image", ref: "g1", opacity: 1, blur: 0 }}
    />,
  );
  expect(screen.getByTestId("bg-layer").style.backgroundImage).toContain(
    "/api/assets/g1",
  );
  Object.defineProperty(document, "visibilityState", {
    value: "hidden",
    configurable: true,
  });
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
  expect(screen.getByTestId("bg-layer").style.backgroundImage).toBe("");
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});
