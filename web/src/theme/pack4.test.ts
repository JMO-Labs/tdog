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
  string,
  [number, string][],
][] = [
  [
    "mission-control",
    "underline",
    "ibm-plex-mono",
    "post",
    [["scanlines", 0.2]],
    "headset mic",
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
    "bubble space helmet",
    "hazard",
    [[0, "hard"]],
  ],
  [
    "ack-ack",
    "block",
    "space-mono",
    "drop",
    [["grain", 0.5]],
    "glass dome helmet",
    "saucer",
    [[1.2, "hard"]],
  ],
  [
    "pocket-monochrome",
    "block",
    "press-start-2p",
    "cartridge",
    [["scanlines", 0.5]],
    "pixel cap",
    "brick",
    [[0, "hard"]],
  ],
  [
    "rip-and-tear",
    "block",
    "vt323",
    "post",
    [
      ["grain", 0.5],
      ["vignette", 0.5],
    ],
    "armoured helmet",
    "lava",
    [[0.3, "bevel"]],
  ],
];

describe("theme flavour pack 4", () => {
  for (const [
    id,
    cur,
    font,
    boot,
    fx,
    costume,
    _m,
    [[radius, shadow]],
  ] of SPEC) {
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
      const c = t.chrome.costume;
      expect(c).not.toBe("none");
      if (c !== "none") expect(c.name).toBe(costume);
      expect(t.chrome.motif!.shapes.length).toBeGreaterThan(1);
    });
  }
  it("themes stay original: no source names in costume/motif data", () => {
    for (const [id] of SPEC) {
      const s = JSON.stringify(findTheme(id)!.chrome);
      expect(s).not.toMatch(/apollo|doom|halo|zelda|mario/i);
    }
  });
});
