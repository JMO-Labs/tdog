import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useMaxWidth } from "./useBreakpoint";

type L = (e: { matches: boolean }) => void;
function mockMQ(width: number) {
  const ls = new Set<L>();
  let w = width;
  vi.stubGlobal("matchMedia", (q: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1]);
    return {
      get matches() {
        return w <= max;
      },
      addEventListener: (_: string, f: L) => ls.add(f),
      removeEventListener: (_: string, f: L) => ls.delete(f),
    };
  });
  return (n: number) => {
    w = n;
    ls.forEach((f) => f({ matches: true }));
  };
}
afterEach(() => vi.unstubAllGlobals());

test("tracks matchMedia max-width", () => {
  const resize = mockMQ(390);
  const { result } = renderHook(() => useMaxWidth(639));
  expect(result.current).toBe(true);
  act(() => resize(800));
  expect(result.current).toBe(false);
});

test("false without matchMedia", () => {
  vi.stubGlobal("matchMedia", undefined);
  const { result } = renderHook(() => useMaxWidth(639));
  expect(result.current).toBe(false);
});
