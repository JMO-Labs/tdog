import { describe, expect, it } from "vitest";
import { contrast } from "./contrast";
import { THEMES } from "./registry";
import { themeAccent } from "./store";

const DARK_SURFACE = "#171a1f";
const LIGHT_SURFACE = "#ffffff";

describe("theme accents", () => {
  it("every theme declares chrome.accent", () => {
    for (const t of THEMES)
      expect(t.chrome.accent, t.id).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("every theme accent reaches 3:1 on the base surface in both modes", () => {
    for (const t of THEMES) {
      const base = { chrome: t.chrome, terminal: t.terminal } as never;
      const alt = t.light ?? base;
      const [dark, light] =
        t.appearance === "light" ? [alt, base] : [base, alt];
      expect(
        contrast(themeAccent(t, dark), DARK_SURFACE),
        `${t.id} dark`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(themeAccent(t, light), LIGHT_SURFACE),
        `${t.id} light`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
