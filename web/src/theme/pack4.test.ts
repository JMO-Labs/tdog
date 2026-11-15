import { describe, expect, it } from "vitest";
import { findTheme } from "./registry";
import { validateTheme } from "./schema";

type Eff = [string, number][];
const SPEC: [
  string,
  string,
  string,
  string,
  Eff,
  string,
  [number, string][],
][] = [
  [
    "mission-control",
    "underline",
    "ibm-plex-mono",
    "post",
    [["scanlines", 0.2]],
    "orbit",
    [[0, "soft"]],
  ],
  [
    "deep-gravity",
    "block",
    "share-tech-mono",
    "tracker",
    [
      ["flicker", 0.2],
      ["vignette", 0.5],
      ["grain", 0.5],
    ],
    "hazard",
    [[0, "hard"]],
  ],
  [
    "ack-ack",
    "block",
    "space-mono",
    "drop",
    [["grain", 0.5]],
    "saucer",
    [[1.2, "hard"]],
  ],
  [
    "pocket-monochrome",
    "block",
    "jetbrains-mono",
    "cartridge",
    [["scanlines", 0.5]],
    "brick",
    [[0, "hard"]],
  ],
  [
    "rip-and-tear",
    "block",
    "space-mono",
    "post",
    [
      ["grain", 0.5],
      ["vignette", 0.5],
    ],
    "lava",
    [[0.3, "bevel"]],
  ],
];

describe("theme flavour pack 4", () => {
  for (const [id, cur, font, boot, fx, _m, [[radius, shadow]]] of SPEC) {
    it(`${id} fills every v2 field`, () => {
      const t = findTheme(id)!;
      const { id: _id, ...data } = t;
      expect(validateTheme(data).ok).toBe(true);
      expect(t.terminal.cursor.shape).toBe(cur);
      expect(t.terminal.font).toBe(font);
      expect(t.chrome.boot).toBe(boot);
      expect(t.terminal.effects.map((e) => e.id)).toEqual(fx.map((e) => e[0]));
      expect(t.terminal.effects.map((e) => e.intensity)).toEqual(
        fx.map((e) => e[1]),
      );
      expect(t.chrome.shape.radius).toBe(radius);
      expect(t.chrome.shape.shadow).toBe(shadow);
      expect(t.chrome.motif!.shapes.length).toBeGreaterThan(1);
    });
  }
  it("themes stay original: no source names in motif data", () => {
    for (const [id] of SPEC) {
      const s = JSON.stringify(findTheme(id)!.chrome);
      expect(s).not.toMatch(/apollo|doom|halo|zelda|mario/i);
    }
  });
});
