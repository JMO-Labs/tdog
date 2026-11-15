import { describe, expect, it } from "vitest";
import { findTheme } from "./registry";
import { validateTheme } from "./schema";

// id, effects, cursor, font, radius, shadow, boot
const PACK = [
  ["linking-book", ["vignette"], "bar", "courier-prime", "soft", "drop"],
  ["llama-skin", ["scanlines"], "block", "vt323", "bevel", "post"],
  ["sim-grid", [], "underline", "ibm-plex-mono", "soft", "post"],
  ["cartridge-blast", [], "block", "press-start-2p", "hard", "cartridge"],
  ["slime-time", [], "block", "space-mono", "soft", "wipe"],
] as const;

describe("theme flavour pack 5", () => {
  for (const [id, fx, cursor, font, shadow, boot] of PACK) {
    describe(id, () => {
      const t = findTheme(id)!;
      it("has effects, cursor, font, shape and boot", () => {
        expect(t.terminal.effects.map((e) => e.id)).toEqual(fx);
        expect(t.terminal.cursor.shape).toBe(cursor);
        expect(t.terminal.font).toBe(font);
        expect(t.chrome.shape.shadow).toBe(shadow);
        expect(t.chrome.boot).toBe(boot);
      });
      it("has an original motif and a costume", () => {
        expect(t.chrome.motif!.shapes.length).toBeGreaterThanOrEqual(3);
        expect(t.chrome.costume).not.toBe("none");
        const c = t.chrome.costume as { rows: string[] };
        expect(c.rows.some((r) => r.includes("#"))).toBe(true);
      });
      it("stays schema valid", () => {
        const { id: _i, ...d } = t as any;
        expect(validateTheme(d).ok).toBe(true);
      });
    });
  }
  it("names the costumes", () => {
    const n = (id: string) => (findTheme(id)!.chrome.costume as any).name;
    expect(PACK.map(([id]) => n(id))).toEqual([
      "explorer cap",
      "headphones",
      "hard hat",
      "propeller cap",
      "slime drip",
    ]);
  });
  it("llama skin scanlines are low", () => {
    const fx = findTheme("llama-skin")!.terminal.effects[0];
    expect(fx.intensity).toBeLessThanOrEqual(0.3);
  });
  it("radii differ by chrome shape intent", () => {
    const r = (id: string) => findTheme(id)!.chrome.shape.radius;
    expect(r("sim-grid")).toBeLessThanOrEqual(0.2);
    expect(r("slime-time")).toBeGreaterThanOrEqual(1.2);
    expect(r("cartridge-blast")).toBeGreaterThan(r("llama-skin"));
  });
});
