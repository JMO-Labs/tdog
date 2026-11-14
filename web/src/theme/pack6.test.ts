import { describe, expect, it } from "vitest";
import { findTheme } from "./registry";

const PACK = [
  ["bayside", "confetti", true, "dark"],
  ["morph-squad", "none", false, "dark"],
  ["truth-is-out-there", "none", false, "dark"],
  ["laser-binder", "zigzag", false, "dark"],
  ["rainbow-leopard", "leopard", true, "dark"],
] as const;

describe("90s theme pack 6", () => {
  for (const [id, pattern, light, appearance] of PACK) {
    it(`${id} is bundled`, () => {
      const t = findTheme(id);
      expect(t).toBeDefined();
      expect(t!.pattern).toBe(pattern);
      expect(t!.appearance).toBe(appearance);
      expect(!!t!.light).toBe(light);
      expect(t!.description).toMatch(/inspired by/i);
    });
  }
  it("morph squad exposes five ranger accents", () => {
    const t = findTheme("morph-squad")!;
    for (const k of ["pink", "cyan", "yellow", "purple", "link"] as const)
      expect(t.chrome[k]).toBeTruthy();
  });
});
