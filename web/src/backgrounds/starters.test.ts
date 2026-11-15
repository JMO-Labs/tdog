import { expect, test } from "vitest";
import { layerCss } from "./spec";
import { STARTERS, starterThumb } from "./starters";

test("30+ unique starters across kinds, each paintable with a thumbnail", () => {
  expect(STARTERS.length).toBeGreaterThanOrEqual(30);
  expect(new Set(STARTERS.map((s) => s.id)).size).toBe(STARTERS.length);
  expect(STARTERS.filter((s) => s.animated).length).toBeGreaterThanOrEqual(3);
  for (const s of STARTERS) {
    const spec = { kind: s.kind, ref: s.ref, opacity: 1, blur: 0 };
    expect(layerCss(spec), s.id).not.toBeNull();
    expect(starterThumb(s), s.id).toBeTruthy();
  }
});

test("starter ids fit the backend ref slug", () => {
  for (const s of STARTERS)
    expect(s.ref).toMatch(
      s.kind === "gradient"
        ? /^linear-gradient|^radial-gradient/
        : /^[a-z0-9-]+$/,
    );
});
