import { beforeEach, expect, it } from "vitest";
import { getMotifOpacity, setMotifOpacity } from "./prefs";

beforeEach(() => localStorage.clear());

it("defaults to 6 and clamps to 0..100", () => {
  expect(getMotifOpacity()).toBe(6);
  setMotifOpacity(0);
  expect(getMotifOpacity()).toBe(0);
  localStorage.setItem("tdog.motifOpacity", "500");
  expect(getMotifOpacity()).toBe(100);
  localStorage.setItem("tdog.motifOpacity", "junk");
  expect(getMotifOpacity()).toBe(6);
});
