import { describe, expect, it } from "vitest";
import { findTheme } from "./registry";

type Row = [
  string, // id
  string, // costume
  string, // cursor shape
  string, // font
  string, // shadow
  number, // radius
  string, // boot
  string[], // effect ids
];
const PACK: Row[] = [
  [
    "dial-up-paranoia",
    "headset",
    "underline",
    "courier-prime",
    "bevel",
    0.3,
    "dialup",
    ["scanlines"],
  ],
  [
    "black-box",
    "fedora",
    "underline",
    "courier-prime",
    "soft",
    0.7,
    "post",
    ["vignette"],
  ],
  [
    "virtual-mind",
    "vr helmet",
    "block",
    "space-mono",
    "glow",
    0.5,
    "rain",
    ["glow", "flicker"],
  ],
  ["multipass", "hair tuft", "bar", "space-mono", "hard", 1.5, "drop", []],
  [
    "bug-hunt",
    "combat helmet",
    "block",
    "ibm-plex-mono",
    "hard",
    0,
    "post",
    ["grain"],
  ],
];

describe("theme flavour pack 3", () => {
  for (const [id, costume, cursor, font, shadow, radius, boot, fx] of PACK) {
    it(`${id} fills the v2 fields`, () => {
      const t = findTheme(id)!;
      expect(t.terminal.cursor.shape).toBe(cursor);
      expect(t.terminal.font).toBe(font);
      expect(t.chrome.shape.shadow).toBe(shadow);
      expect(t.chrome.shape.radius).toBe(radius);
      expect(t.chrome.boot).toBe(boot);
      expect(t.terminal.effects.map((e) => e.id)).toEqual(fx);
      expect(t.terminal.effects.every((e) => e.intensity <= 0.5)).toBe(true);
      expect(t.chrome.motif!.shapes.length).toBeGreaterThan(1);
    });
  }
});
