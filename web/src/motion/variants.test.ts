import { describe, expect, it } from "vitest";
import { ENTER, EXIT, FADE, pickVariant } from "./variants";

describe("variant pools", () => {
  it("has 6 entries and 6 exits with consistent keyframe lengths", () => {
    expect(ENTER).toHaveLength(6);
    expect(EXIT).toHaveLength(6);
    for (const v of [...ENTER, ...EXIT]) {
      const n = v.times.length;
      expect(v.keyframes.transform).toHaveLength(n);
      expect(v.keyframes.opacity).toHaveLength(n);
      expect(v.times[0]).toBe(0);
      expect(v.times[n - 1]).toBe(1);
    }
  });
});

describe("pickVariant", () => {
  it("picks by rng across the full pool", () => {
    expect(pickVariant(ENTER, false, () => 0)).toBe(ENTER[0]);
    expect(pickVariant(ENTER, false, () => 0.999)).toBe(ENTER[5]);
    expect(pickVariant(EXIT, false, () => 0.5)).toBe(EXIT[3]);
  });
  it("returns a 200 ms opacity fade under reduced motion", () => {
    const v = pickVariant(ENTER, true, () => 0.3);
    expect(v).toBe(FADE);
    expect(v.duration).toBe(0.2);
    expect(Object.keys(v.keyframes)).toEqual(["opacity"]);
  });
});
