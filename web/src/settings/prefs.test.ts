import { beforeEach, expect, test } from "vitest";
import { getPref, setPref } from "./prefs";

beforeEach(() => localStorage.clear());

test("stale pet and dress keys in storage do not throw or surface", () => {
  localStorage.setItem("tdog.pet", "1");
  localStorage.setItem("tdog.dress", "0");
  expect(() => getPref("serious")).not.toThrow();
  expect(getPref("serious")).toBe(false);
  setPref("boot", false);
  expect(getPref("boot")).toBe(false);
  expect(getPref("pet" as never)).toBeUndefined();
  expect(getPref("dress" as never)).toBeUndefined();
});
