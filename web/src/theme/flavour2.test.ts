import { describe, expect, it } from "vitest";
import { findTheme } from "./registry";

type Spec = [
  id: string,
  effects: string[],
  costume: string,
  cursor: string,
  blink: boolean,
  font: string,
  radius: number,
  shadow: string,
  border: number,
  boot: string,
];

const SPECS: Spec[] = [
  [
    "wetwired",
    ["glow", "scanlines"],
    "vr visor",
    "bar",
    true,
    "share-tech-mono",
    0,
    "none",
    1,
    "rain",
  ],
  [
    "sewer-squad",
    [],
    "bandana eye mask",
    "block",
    true,
    "space-mono",
    1.5,
    "hard",
    3,
    "wipe",
  ],
  [
    "wake-up-neo",
    ["glyph-rain", "glow"],
    "tiny shades",
    "block",
    true,
    "share-tech-mono",
    0,
    "none",
    1,
    "rain",
  ],
  [
    "section-9",
    ["glow", "vignette"],
    "headset",
    "bar",
    true,
    "ibm-plex-mono",
    0.125,
    "none",
    1,
    "post",
  ],
  [
    "mainframe",
    ["glow"],
    "visor ring",
    "block",
    true,
    "share-tech-mono",
    0,
    "glow",
    1,
    "tracker",
  ],
];

describe("theme flavour pack 2", () => {
  for (const [
    id,
    fx,
    cos,
    cur,
    blink,
    font,
    radius,
    shadow,
    border,
    boot,
  ] of SPECS) {
    it(`${id} fills the v2 fields`, () => {
      const t = findTheme(id)!;
      expect(t.terminal.effects.map((e) => e.id).sort()).toEqual(
        [...fx].sort(),
      );
      const c = t.chrome.costume;
      expect(c === "none" ? c : c.name).toBe(cos);
      expect(t.terminal.cursor).toEqual({ shape: cur, blink });
      expect(t.terminal.font).toBe(font);
      expect(t.chrome.shape).toEqual({ radius, shadow, border });
      expect(t.chrome.boot).toBe(boot);
      expect(t.chrome.motif!.shapes.length).toBeGreaterThan(1);
      expect(t.terminal.motif!.shapes.length).toBeGreaterThan(1);
    });
  }
});
