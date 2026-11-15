import { beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_FX } from "./resolve";
import { getFx, resetFxCache, setFx, setFxOn } from "./store";

beforeEach(() => {
  localStorage.clear();
  resetFxCache();
});

test("defaults when nothing stored or storage is corrupt", () => {
  expect(getFx()).toEqual(DEFAULT_FX);
  localStorage.setItem("tdog.fx", "{nope");
  resetFxCache();
  expect(getFx()).toEqual(DEFAULT_FX);
});

test("persists to localStorage and survives reload", () => {
  setFxOn("flicker", true);
  setFx({ ...getFx(), master: false, intensity: 0.4 });
  resetFxCache();
  const s = getFx();
  expect(s.master).toBe(false);
  expect(s.intensity).toBe(0.4);
  expect(s.on.flicker).toBe(true);
  expect(s.on.scanlines).toBe(true);
});

test("reduced-motion pref follows the media query and unsubscribes", async () => {
  const { act, renderHook } = await import("@testing-library/react");
  const { useReducedMotionPref } = await import("./store");
  let fire: () => void = () => {};
  const mq = {
    matches: false,
    addEventListener: vi.fn((_: string, f: () => void) => (fire = f)),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => mq);
  const { result, unmount } = renderHook(() => useReducedMotionPref());
  expect(result.current).toBe(false);
  mq.matches = true;
  act(() => fire());
  expect(result.current).toBe(true);
  unmount();
  expect(mq.removeEventListener).toHaveBeenCalled();
  vi.unstubAllGlobals();
});
