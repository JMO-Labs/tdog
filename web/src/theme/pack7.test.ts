import { describe, expect, it } from "vitest";
import { findTheme } from "./registry";

type Row = [
  id: string,
  cursor: string,
  font: string,
  effects: Record<string, number | true>,
  costume: string,
  radius: number,
  shadow: string,
  boot: string,
];
// effect value true = any intensity > 0
const PACK: Row[] = [
  [
    "colonial-marine",
    "block",
    "share-tech-mono",
    { scanlines: true, glow: true },
    "combat helmet",
    0,
    "hard",
    "tracker",
  ],
  [
    "liquid-metal",
    "bar",
    "share-tech-mono",
    { glow: true },
    "tiny shades",
    0.2,
    "bevel",
    "post",
  ],
  [
    "ninety-five",
    "underline",
    "courier-prime",
    {},
    "wizard hat",
    0,
    "bevel",
    "post",
  ],
  [
    "hack-the-planet",
    "block",
    "share-tech-mono",
    { glow: true, "glyph-rain": true },
    "visor shades",
    0.125,
    "glow",
    "dialup",
  ],
  [
    "isla-nublar",
    "underline",
    "ibm-plex-mono",
    { vignette: true },
    "safari hat",
    0.75,
    "soft",
    "post",
  ],
];

describe("theme flavour pack 1", () => {
  for (const [id, cursor, font, fx, costume, radius, shadow, boot] of PACK) {
    describe(id, () => {
      const t = () => findTheme(id)!;
      it("fills the v2 fields", () => {
        expect(t().terminal.cursor.shape).toBe(cursor);
        expect(t().terminal.font).toBe(font);
        expect(t().chrome.shape.radius).toBe(radius);
        expect(t().chrome.shape.shadow).toBe(shadow);
        expect(t().chrome.boot).toBe(boot);
        const c = t().chrome.costume;
        expect(c !== "none" && c.name).toBe(costume);
      });
      it("turns on its effects", () => {
        const got = t().terminal.effects;
        expect(got.map((e) => e.id).sort()).toEqual(Object.keys(fx).sort());
        got.forEach((e) => expect(e.intensity).toBeGreaterThan(0));
      });
      it("has an original motif on terminal and chrome", () => {
        expect(t().terminal.motif!.shapes.length).toBeGreaterThan(2);
        expect(t().chrome.motif!.shapes.length).toBeGreaterThan(2);
      });
    });
  }
  it("colonial marine has a thin border; glyph rain and glow stay low", () => {
    expect(findTheme("colonial-marine")!.chrome.shape.border).toBe(1);
    const e = findTheme("hack-the-planet")!.terminal.effects;
    expect(e.find((x) => x.id === "glyph-rain")!.intensity).toBeLessThanOrEqual(
      0.3,
    );
    const l = findTheme("liquid-metal")!.terminal.effects;
    expect(l[0].intensity).toBeLessThanOrEqual(0.3);
  });
});
