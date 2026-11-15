import { expect, test } from "vitest";
import { benchEffects } from "./benchFx";

test("all forces every effect at full intensity", () => {
  const all = benchEffects("?fx=all");
  expect(all.map((e) => e.id).sort()).toEqual([
    "flicker",
    "glow",
    "glyph-rain",
    "grain",
    "scanlines",
    "tracking",
    "vignette",
  ]);
  expect(all.every((e) => e.intensity === 1)).toBe(true);
});

test("single id, none and garbage", () => {
  expect(benchEffects("?fx=grain")).toEqual([{ id: "grain", intensity: 1 }]);
  expect(benchEffects("")).toEqual([]);
  expect(benchEffects("?fx=bogus")).toEqual([]);
});
