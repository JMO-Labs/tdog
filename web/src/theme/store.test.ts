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
  it("defaults to memphis-pop and leaves chrome untouched", () => {
    expect(themeStore.get().id).toBe("memphis-pop");
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
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
    expect(themeStore.terminal().background).toBe(THEMES[0].light!.terminal.bg);
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
    const t = toTerminalTheme(THEMES[0].terminal);
    expect(t.foreground).toBe(THEMES[0].terminal.fg);
    expect(t.brightWhite).toBe(THEMES[0].terminal.ansi[15]);
    expect(t.selectionBackground).toBe(THEMES[0].terminal.selection);
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
