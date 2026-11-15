import { describe, expect, it } from "vitest";
import { findTheme } from "./registry";
import { motifSvg } from "./motif";
import { validateTheme } from "./schema";

const SHAPES = {
  "sticker hard": { radius: 0.25, shadow: "hard", border: 2 },
  sticker: { radius: 1, shadow: "hard", border: 1 },
  soft: { radius: 1, shadow: "soft", border: 1 },
  pill: { radius: 1.5, shadow: "none", border: 2 },
} as const;

// id, costume, cursor, font, effects, shape, boot
const FLAVOUR = [
  [
    "bayside",
    "backwards cap",
    "bar",
    "space-mono",
    [],
    "sticker hard",
    "rewind",
  ],
  [
    "morph-squad",
    "visor",
    "block",
    "share-tech-mono",
    ["glow"],
    "sticker",
    "drop",
  ],
  [
    "truth-is-out-there",
    "tinfoil hat",
    "underline",
    "courier-prime",
    ["vignette", "grain"],
    "soft",
    "tracker",
  ],
  [
    "laser-binder",
    "scrunchie bow",
    "bar",
    "space-mono",
    ["glow"],
    "pill",
    "drop",
  ],
  [
    "rainbow-leopard",
    "sparkly bow",
    "bar",
    "space-mono",
    [],
    "sticker",
    "drop",
  ],
  [
    "memphis-pop",
    "backwards cap",
    "block",
    "jetbrains-mono",
    [],
    "sticker",
    "drop",
  ],
  ["night-market", "none", "block", "jetbrains-mono", ["glow"], "soft", "drop"],
] as const;

describe("theme flavour pack 6", () => {
  for (const [id, costume, cur, font, fx, shape, boot] of FLAVOUR) {
    describe(id, () => {
      const t = findTheme(id)!;
      it("fills the v2 fields", () => {
        expect(t.terminal.cursor.shape).toBe(cur);
        expect(t.terminal.font).toBe(font);
        expect(t.terminal.effects.map((e) => e.id)).toEqual(fx);
        expect(t.chrome.shape).toEqual(SHAPES[shape]);
        expect(t.chrome.boot).toBe(boot);
      });
      it("is schema valid and renders its motif", () => {
        const { id: _id, ...data } = t;
        expect(validateTheme(data).ok).toBe(true);
        if (id !== "memphis-pop") {
          expect(t.chrome.motif).toBeDefined();
          expect(
            motifSvg(
              t.chrome.motif!,
              t.chrome.tokens as Record<string, string>,
            ),
          ).toMatch(/^data:image\/svg/);
        }
      });
    });
  }
  it("glow is low where specified", () => {
    for (const id of ["morph-squad", "night-market"])
      expect(findTheme(id)!.terminal.effects[0].intensity).toBeLessThanOrEqual(
        0.3,
      );
  });
  it("memphis pop keeps confetti", () => {
    expect(findTheme("memphis-pop")!.chrome.pattern).toBe("confetti");
  });
});
