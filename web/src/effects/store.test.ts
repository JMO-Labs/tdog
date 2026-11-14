import { beforeEach, expect, test } from "vitest";
import { DEFAULT_FX } from "./resolve";
import { getFx, resetFxCache, setFx, setFxOn } from "./store";

beforeEach(() => {
  localStorage.clear();
  resetFxCache();
});

test("defaults when nothing stored or storage is corrupt", () => {
  expect(getFx()).toEqual(DEFAULT_FX);
  localStorage.setItem("tdog.fx", "{nope");
  resetFxCache();
  expect(getFx()).toEqual(DEFAULT_FX);
});

test("persists to localStorage and survives reload", () => {
  setFxOn("flicker", true);
  setFx({ ...getFx(), master: false, intensity: 0.4 });
  resetFxCache();
  const s = getFx();
  expect(s.master).toBe(false);
  expect(s.intensity).toBe(0.4);
  expect(s.on.flicker).toBe(true);
  expect(s.on.scanlines).toBe(true);
});
