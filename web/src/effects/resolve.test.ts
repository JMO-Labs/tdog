import { expect, test } from "vitest";
import { DEFAULT_FX, resolveEffects, type FxSettings } from "./resolve";

const themeFx = [
  { id: "scanlines", intensity: 0.5 },
  { id: "glyph-rain", intensity: 1 },
  { id: "flicker", intensity: 0.4 },
] as const;
const s = (o: Partial<FxSettings> = {}): FxSettings => ({
  ...DEFAULT_FX,
  ...o,
  on: { ...DEFAULT_FX.on, ...o.on },
});
const ids = (r: { id: string }[]) => r.map((e) => e.id);

test("defaults: flicker and tracking off, rest on", () => {
  expect(DEFAULT_FX.master).toBe(true);
  expect(DEFAULT_FX.on.flicker).toBe(false);
  expect(DEFAULT_FX.on.tracking).toBe(false);
  for (const id of ["scanlines", "glow", "vignette", "grain", "glyph-rain"])
    expect(DEFAULT_FX.on[id as keyof typeof DEFAULT_FX.on]).toBe(true);
});

test("theme effects pass through, gated by per-effect switches", () => {
  const r = resolveEffects([...themeFx], s(), false, true);
  expect(ids(r)).toEqual(["scanlines", "glyph-rain"]);
  const r2 = resolveEffects(
    [...themeFx],
    s({ on: { flicker: true } as never }),
    false,
    true,
  );
  expect(ids(r2)).toContain("flicker");
});

test("intensity scales theme intensity", () => {
  const r = resolveEffects([...themeFx], s({ intensity: 0.5 }), false, true);
  expect(r.find((e) => e.id === "scanlines")!.intensity).toBeCloseTo(0.25);
});

test("master off disables everything", () => {
  expect(
    resolveEffects([...themeFx], s({ master: false }), false, true),
  ).toEqual([]);
});

test("reduced motion or hidden tab drops animated effects only", () => {
  expect(ids(resolveEffects([...themeFx], s(), true, true))).toEqual([
    "scanlines",
  ]);
  expect(ids(resolveEffects([...themeFx], s(), false, false))).toEqual([
    "scanlines",
  ]);
});

test("zero intensity yields nothing", () => {
  expect(
    resolveEffects([...themeFx], s({ intensity: 0 }), false, true),
  ).toEqual([]);
});
