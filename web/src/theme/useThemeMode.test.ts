import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeMode } from "./useThemeMode";

const KEY = "tdog.theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(() => vi.restoreAllMocks());

describe("useThemeMode", () => {
  it("defaults to system with no data-theme", () => {
    const { result } = renderHook(() => useThemeMode());
    expect(result.current.mode).toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("cycles system -> light -> dark -> system", () => {
    const { result } = renderHook(() => useThemeMode());
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      act(() => result.current.cycle());
      seen.push(result.current.mode);
    }
    expect(seen).toEqual(["light", "dark", "system"]);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("sets data-theme and persists", () => {
    const { result } = renderHook(() => useThemeMode());
    act(() => result.current.cycle());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(KEY)).toBe("light");
  });

  it("restores a stored mode and ignores junk", () => {
    localStorage.setItem(KEY, "dark");
    expect(renderHook(() => useThemeMode()).result.current.mode).toBe("dark");
    localStorage.setItem(KEY, "neon");
    expect(renderHook(() => useThemeMode()).result.current.mode).toBe("system");
  });

  it("survives storage failures", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useThemeMode());
    expect(result.current.mode).toBe("system");
    act(() => result.current.cycle());
    expect(result.current.mode).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
