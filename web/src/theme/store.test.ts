import { beforeEach, describe, expect, it, vi } from "vitest";
import { themeStore, toTerminalTheme } from "./store";
import { THEMES } from "./registry";

const KEY = "tdog.theme.id";
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-theme");
  themeStore.reset();
});

describe("themeStore", () => {
  it("defaults to memphis-pop and leaves colour tokens untouched", () => {
    expect(themeStore.get().id).toBe("memphis-pop");
    const s = document.documentElement.style;
    expect(s.getPropertyValue("--bg")).toBe("");
    expect(s.getPropertyValue("--pattern")).toBe("");
  });
  it("persists selection and ignores unknown ids", () => {
    const other = THEMES[1] ?? THEMES[0];
    themeStore.select(other.id);
    expect(localStorage.getItem(KEY)).toBe(other.id);
    themeStore.select("bogus");
    expect(themeStore.get().id).toBe(other.id);
    themeStore.reset();
    expect(themeStore.get().id).toBe(other.id);
  });
  it("resolves a terminal theme per pane, defaulting to the page theme", () => {
    themeStore.select("memphis-pop");
    const other = THEMES.find((t) => t.id === "night-market")!;
    expect(themeStore.terminal("night-market").background).toBe(
      other.terminal.palette.bg,
    );
    expect(themeStore.terminal(undefined)).toEqual(themeStore.terminal());
    expect(themeStore.terminal("bogus")).toEqual(themeStore.terminal());
    expect(themeStore.terminal("night-market").background).not.toBe(
      themeStore.terminal().background,
    );
  });
  it("applies chrome shape vars page-wide", () => {
    themeStore.select("memphis-pop");
    const s = document.documentElement.style;
    expect(s.getPropertyValue("--radius-scale")).toBe("1");
    expect(s.getPropertyValue("--border-width")).toBe("1");
  });
  it("applies chrome vars and pattern, notifies subscribers", () => {
    const fn = vi.fn();
    const off = themeStore.subscribe(fn);
    themeStore.select("night-market");
    const s = document.documentElement.style;
    expect(s.getPropertyValue("--bg")).toMatch(/^#/);
    expect(s.getPropertyValue("--pattern")).toBe("var(--pat-zigzag)");
    expect(fn).toHaveBeenCalled();
    off();
  });
  it("forces data-theme to appearance when no light variant", () => {
    themeStore.select("night-market");
    themeStore.setScheme("light");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("uses the light variant when shipped", () => {
    themeStore.select("memphis-pop");
    themeStore.setScheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(themeStore.terminal().background).toBe(
      THEMES[0].light!.terminal.palette.bg,
    );
    themeStore.setScheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
  it("preview applies live and revert restores, without persisting", () => {
    themeStore.preview("night-market");
    expect(themeStore.get().id).toBe("night-market");
    expect(localStorage.getItem(KEY)).toBeNull();
    themeStore.preview(null);
    expect(themeStore.get().id).toBe("memphis-pop");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("");
  });
  it("maps to a renderer theme", () => {
    const t = toTerminalTheme(THEMES[0].terminal.palette);
    expect(t.foreground).toBe(THEMES[0].terminal.palette.fg);
    expect(t.brightWhite).toBe(THEMES[0].terminal.palette.ansi[15]);
    expect(t.selectionBackground).toBe(THEMES[0].terminal.palette.selection);
  });
  it("falls back to the default when storage throws", () => {
    themeStore.select("night-market");
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    themeStore.reset();
    spy.mockRestore();
    expect(themeStore.get().id).toBe("memphis-pop");
  });
});

describe("header motif", () => {
  it("sets --header-motif from chrome.motif and removes it on switch", () => {
    const base = THEMES.find((t) => t.id === "memphis-pop")!;
    const withMotif = {
      ...base,
      id: "motif-test",
      chrome: {
        ...base.chrome,
        motif: {
          viewBox: [0, 0, 10, 10] as [number, number, number, number],
          tile: [10, 10] as [number, number],
          shapes: [
            {
              type: "circle" as const,
              cx: 5,
              cy: 5,
              r: 2,
              fill: "pink" as const,
            },
          ],
        },
      },
    };
    THEMES.push(withMotif);
    try {
      themeStore.select("motif-test");
      const v =
        document.documentElement.style.getPropertyValue("--header-motif");
      expect(v).toMatch(/^url\("data:image\/svg\+xml,/);
      expect(decodeURIComponent(v)).not.toContain('fill="none"');
      themeStore.select("memphis-pop");
      expect(
        document.documentElement.style.getPropertyValue("--header-motif"),
      ).toBe("");
    } finally {
      THEMES.pop();
    }
  });
});
