import { describe, expect, it } from "vitest";
import { contrast, validateTheme } from "./schema";
import { THEMES } from "./registry";

// Raw theme data: strip the registry-added `id`, which is not part of the format.
const ok = () => {
  const raw = JSON.parse(JSON.stringify(THEMES[0]));
  delete raw.id;
  return raw;
};

describe("validateTheme", () => {
  it("accepts a good theme", () => {
    expect(validateTheme(ok()).ok).toBe(true);
  });
  it("rejects unknown keys at every level", () => {
    for (const mutate of [
      (t: any) => (t.css = "body{}"),
      (t: any) => (t.terminal.extra = "#000000"),
      (t: any) => (t.chrome.nope = "#000000"),
    ]) {
      const t = ok();
      mutate(t);
      expect(validateTheme(t).ok).toBe(false);
    }
  });
  it("rejects non-hex colors", () => {
    for (const bad of ["red", "#12", "#gggggg", "rgb(0,0,0)", "url(x)", 5]) {
      const t = ok();
      t.terminal.fg = bad;
      expect(validateTheme(t).ok).toBe(false);
    }
    const t = ok();
    t.chrome.bg = "expression(1)";
    expect(validateTheme(t).ok).toBe(false);
  });
  it("requires 16 ANSI colors, valid appearance and pattern", () => {
    let t = ok();
    t.terminal.ansi = t.terminal.ansi.slice(1);
    expect(validateTheme(t).ok).toBe(false);
    t = ok();
    t.appearance = "sepia";
    expect(validateTheme(t).ok).toBe(false);
    t = ok();
    t.pattern = "evil";
    expect(validateTheme(t).ok).toBe(false);
    expect(validateTheme(null).ok).toBe(false);
  });
  it("validates the optional light variant", () => {
    const t = ok();
    t.light = { terminal: { ...t.terminal, bg: "nope" }, chrome: {} };
    expect(validateTheme(t).ok).toBe(false);
  });
});

describe("bundled themes", () => {
  it("has unique ids and memphis-pop first", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("memphis-pop");
  });
  it("ships the 90s theme pack 3", () => {
    const ids = THEMES.map((t) => t.id);
    for (const id of [
      "dial-up-paranoia",
      "black-box",
      "virtual-mind",
      "multipass",
      "bug-hunt",
    ])
      expect(ids).toContain(id);
  });
  it("bundles the 90s pack 5", () => {
    const ids = THEMES.map((t) => t.id);
    for (const id of [
      "linking-book",
      "llama-skin",
      "sim-grid",
      "cartridge-blast",
      "slime-time",
    ])
      expect(ids).toContain(id);
    expect(THEMES.find((t) => t.id === "linking-book")?.light).toBeDefined();
    expect(THEMES.find((t) => t.id === "slime-time")?.pattern).toBe("confetti");
  });
  for (const t of THEMES) {
    describe(t.id, () => {
      it("is schema valid", () => {
        const { id, ...data } = t;
        expect(id).toBeTruthy();
        expect(validateTheme(data)).toEqual({ ok: true, theme: data });
      });
      for (const [label, term] of [
        ["base", t.terminal],
        ...(t.light ? [["light", t.light.terminal] as const] : []),
      ] as const) {
        it(`${label}: fg/bg contrast >= 4.5`, () => {
          expect(contrast(term.fg, term.bg)).toBeGreaterThanOrEqual(4.5);
        });
        it(`${label}: every ANSI color >= 3:1 on bg`, () => {
          term.ansi.forEach((c, i) =>
            expect(
              contrast(c, term.bg),
              `ansi ${i} ${c}`,
            ).toBeGreaterThanOrEqual(3),
          );
        });
      }
    });
  }
  it("rejects a non-string font", () => {
    const t = ok();
    t.font = 5;
    expect(validateTheme(t).ok).toBe(false);
  });
});
