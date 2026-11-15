import { beforeEach, describe, expect, it, vi } from "vitest";
import { themeAccent, themeStore, toTerminalTheme } from "./store";
import { setPref } from "../settings/prefs";
import { THEMES, findTheme } from "./registry";

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
  it("apply sets --accent from the theme and leaves base surfaces to CSS", () => {
    const base = findTheme("memphis-pop")!;
    THEMES.push({
      ...base,
      id: "accent-test",
      chrome: { ...base.chrome, accent: "#102030" },
    });
    try {
      themeStore.select("accent-test");
      const s = document.documentElement.style;
      expect(s.getPropertyValue("--accent")).toBe("#102030");
      expect(s.getPropertyValue("--accent-ink")).toBe("#fff");
      for (const p of ["--bg", "--surface", "--radius-scale", "--border-width"])
        expect(s.getPropertyValue(p)).toBe("");
    } finally {
      THEMES.pop();
    }
  });
  it("themeAccent prefers chrome.accent, else the pink token", () => {
    const base = findTheme("memphis-pop")!;
    const chrome = { ...base.chrome, tokens: { pink: "#abcdef" } };
    expect(
      themeAccent({ ...base, chrome: { ...chrome, accent: "#123456" } }),
    ).toBe("#123456");
    expect(themeAccent({ ...base, chrome })).toBe("#abcdef");
  });
  it("serious mode accent is the plain theme's accent", () => {
    const base = findTheme("memphis-pop")!;
    THEMES.push({
      ...base,
      id: "accent-test",
      chrome: { ...base.chrome, accent: "#102030" },
    });
    try {
      themeStore.select("accent-test");
      setPref("serious", true);
      const got = document.documentElement.style.getPropertyValue("--accent");
      expect(got).toBe(themeAccent(findTheme("plain")!));
      expect(got).not.toBe("#102030");
    } finally {
      setPref("serious", false);
      THEMES.pop();
    }
  });
  it("tint is written as --tint and --tint-pct (max 5)", () => {
    const base = findTheme("memphis-pop")!;
    THEMES.push({
      ...base,
      id: "tint-test",
      chrome: { ...base.chrome, tint: "#ff0000", tintPct: 9 },
    });
    try {
      themeStore.select("tint-test");
      const s = document.documentElement.style;
      expect(s.getPropertyValue("--tint")).toBe("#ff0000");
      expect(s.getPropertyValue("--tint-pct")).toBe("5%");
    } finally {
      THEMES.pop();
    }
  });
  it("applies pattern and notifies subscribers", () => {
    const fn = vi.fn();
    const off = themeStore.subscribe(fn);
    themeStore.select("night-market");
    const s = document.documentElement.style;
    expect(s.getPropertyValue("--pattern")).toMatch(/^url\("data:image\/svg/);
    expect(fn).toHaveBeenCalled();
    off();
  });
  it("forces data-theme to appearance when no light variant", () => {
    // Every bundled theme ships a light variant; register a dark-only one.
    const { light: _light, ...darkOnly } = THEMES[0];
    THEMES.push({ ...darkOnly, id: "dark-only-test" });
    try {
      themeStore.select("dark-only-test");
      themeStore.setScheme("light");
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      THEMES.pop();
    }
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
  it("toggle swaps terminal bg/fg between dark and light variants", () => {
    for (const t of THEMES.filter((x) => x.light)) {
      themeStore.select(t.id);
      themeStore.setScheme("dark");
      const d = themeStore.terminal();
      themeStore.setScheme("light");
      const l = themeStore.terminal();
      expect(d.background, t.id).toBe(t.terminal.palette.bg);
      expect(d.foreground, t.id).toBe(t.terminal.palette.fg);
      expect(l.background, t.id).toBe(t.light!.terminal.palette.bg);
      expect(l.foreground, t.id).toBe(t.light!.terminal.palette.fg);
      expect(l.background, t.id).not.toBe(d.background);
    }
  });
  it("toggle swaps terminal bg/fg for a light-first theme", () => {
    const base = findTheme("memphis-pop")!;
    const dark = base.terminal.palette;
    const lightPal = { ...dark, bg: "#fafafa", fg: "#111111" };
    THEMES.push({
      ...base,
      id: "light-first-test",
      appearance: "light",
      terminal: { ...base.terminal, palette: lightPal },
      light: { terminal: { palette: dark }, chrome: base.chrome },
    });
    try {
      themeStore.select("light-first-test");
      themeStore.setScheme("light");
      expect(themeStore.terminal().background).toBe("#fafafa");
      expect(themeStore.terminal().foreground).toBe("#111111");
      themeStore.setScheme("dark");
      expect(themeStore.terminal().background).toBe(dark.bg);
      expect(themeStore.terminal().foreground).toBe(dark.fg);
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      THEMES.pop();
    }
  });
  it("toggle swaps terminal bg/fg for a dark-first theme", () => {
    const base = findTheme("memphis-pop")!;
    themeStore.select("memphis-pop");
    themeStore.setScheme("dark");
    expect(themeStore.terminal().background).toBe(base.terminal.palette.bg);
    themeStore.setScheme("light");
    expect(themeStore.terminal().background).toBe(
      base.light!.terminal.palette.bg,
    );
  });
  it("system follows prefers-color-scheme changes live", () => {
    let matches = false;
    let fire: () => void = () => {};
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, cb: () => void) => (fire = cb),
      removeEventListener: () => {},
    }));
    try {
      themeStore.reset();
      themeStore.select("memphis-pop");
      const before = themeStore.terminal().background;
      matches = true;
      fire();
      expect(themeStore.terminal().background).toBe(
        findTheme("memphis-pop")!.light!.terminal.palette.bg,
      );
      expect(themeStore.terminal().background).not.toBe(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("preview applies live and revert restores, without persisting", () => {
    themeStore.preview("night-market");
    expect(themeStore.get().id).toBe("night-market");
    expect(localStorage.getItem(KEY)).toBeNull();
    themeStore.preview(null);
    expect(themeStore.get().id).toBe("memphis-pop");
    expect(document.documentElement.style.getPropertyValue("--pattern")).toBe(
      "",
    );
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

describe("motif fallbacks and terminal motif", () => {
  it("themes without a motif keep --pattern behaviour and have no terminal motif", () => {
    themeStore.select("memphis-pop");
    const s = document.documentElement.style;
    expect(s.getPropertyValue("--pattern")).toBe("");
    expect(themeStore.terminalMotif()).toBeNull();
  });

  it("chrome motif replaces --pattern; terminal motif returns a url", () => {
    const base = THEMES.find((t) => t.id === "memphis-pop")!;
    const motif = {
      viewBox: [0, 0, 4, 4] as [number, number, number, number],
      tile: [4, 4] as [number, number],
      shapes: [{ type: "rect" as const, x: 0, y: 0, width: 2, height: 2 }],
    };
    THEMES.push({
      ...base,
      id: "motif-t2",
      chrome: { ...base.chrome, motif },
      terminal: { ...base.terminal, motif },
    });
    try {
      themeStore.select("motif-t2");
      expect(
        document.documentElement.style.getPropertyValue("--pattern"),
      ).toMatch(/^url\("data:image\/svg\+xml,/);
      expect(themeStore.terminalMotif()).toMatch(/^url\("data:image/);
      expect(themeStore.terminalMotif("memphis-pop")).toBeNull();
    } finally {
      THEMES.pop();
      themeStore.select("memphis-pop");
    }
  });

  it("terminal motif resolves tokens the theme does not set from CSS defaults", () => {
    const base = THEMES.find((t) => t.id === "memphis-pop")!;
    const motif = {
      viewBox: [0, 0, 4, 4] as [number, number, number, number],
      tile: [4, 4] as [number, number],
      shapes: [
        {
          type: "rect" as const,
          x: 0,
          y: 0,
          width: 2,
          height: 2,
          fill: "pink",
        },
      ],
    };
    THEMES.push({
      ...base,
      id: "motif-t3",
      chrome: { ...base.chrome, tokens: {} },
      terminal: { ...base.terminal, motif },
    });
    document.documentElement.style.setProperty("--pink", "#abcdef");
    try {
      themeStore.select("motif-t3");
      const svg = decodeURIComponent(themeStore.terminalMotif()!);
      expect(svg).toContain("#abcdef");
      expect(svg).not.toContain("#808080");
    } finally {
      document.documentElement.style.removeProperty("--pink");
      THEMES.pop();
      themeStore.select("memphis-pop");
    }
  });
});

it("previewPane scopes a theme to one pane without touching the page", () => {
  themeStore.reset();
  const style = document.documentElement.getAttribute("style");
  const other = THEMES.find((t) => t.id !== themeStore.get().id)!.id;
  const fn = vi.fn();
  const off = themeStore.subscribe(fn);
  themeStore.previewPane("p1", other);
  expect(themeStore.paneTheme("p1", undefined)).toBe(other);
  expect(themeStore.paneTheme("p2", "x")).toBe("x");
  expect(fn).toHaveBeenCalled();
  expect(document.documentElement.getAttribute("style")).toBe(style);
  themeStore.previewPane(null, null);
  expect(themeStore.paneTheme("p1", undefined)).toBeUndefined();
  off();
});
