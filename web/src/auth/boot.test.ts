import { beforeEach, expect, test } from "vitest";
import { takeBoot } from "./boot";

beforeEach(() => sessionStorage.clear());

test("boot plays once per browser session", () => {
  expect(takeBoot()).toBe(true);
  expect(takeBoot()).toBe(false);
  expect(sessionStorage.getItem("tdog.booted")).toBe("1");
});

test("boot is skipped when already marked", () => {
  sessionStorage.setItem("tdog.booted", "1");
  expect(takeBoot()).toBe(false);
});
