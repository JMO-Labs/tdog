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
  it("morph squad exposes five distinct ranger accents incl. black", () => {
    const c = findTheme("morph-squad")!.chrome;
    const vals = [c.pink, c.cyan, c.yellow, c.purple, c.ink];
    expect(vals.every(Boolean)).toBe(true);
    expect(new Set(vals).size).toBe(5);
  });
  it("morph squad green differs from yellow", () => {
    const a = findTheme("morph-squad")!.terminal.ansi;
    expect(a[2]).not.toBe(a[3]);
    expect(a[10]).not.toBe(a[11]);
  });
  it("truth is out there red is not green", () => {
    const a = findTheme("truth-is-out-there")!.terminal.ansi;
    expect(a[1]).not.toBe("#6fd66f");
    expect(a[9]).not.toBe("#9bf09b");
  });
});
