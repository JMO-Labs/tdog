import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { usePetEngine } from "./usePetEngine";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 1, 12));
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

test("feeds decoded output from any pane to the pet", () => {
  const { result } = renderHook(() => usePetEngine());
  act(() => result.current.feed(new TextEncoder().encode("3 passed")));
  expect(result.current.pet.view().act).toBe("celebrate");
  act(() => result.current.feed(new Uint8Array([7])));
  expect(result.current.pet.view().act).toBe("startle");
  act(() => result.current.feed());
  expect(result.current.pet.view().reading).toBe(true);
});

test("keystrokes anywhere count as typing; the clock ticks", () => {
  const { result, unmount } = renderHook(() => usePetEngine());
  act(() => void dispatchEvent(new KeyboardEvent("keydown", { key: "a" })));
  expect(result.current.pet.view().typing).toBe(true);
  act(() => void vi.advanceTimersByTime(21000));
  expect(result.current.pet.view().act).toBe("yawn");
  unmount();
  act(() => void dispatchEvent(new KeyboardEvent("keydown", { key: "a" })));
});
