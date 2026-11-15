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

import { bootFor, BOOT_MS } from "./boot";

test("variant follows the page theme; unknown falls back to drop", () => {
  expect(bootFor("colonial-marine", false)).toBe("tracker");
  expect(bootFor("wake-up-neo", false)).toBe("rain");
  expect(bootFor("mainframe", false)).toBe("post");
  expect(bootFor("dial-up-paranoia", false)).toBe("dialup");
  expect(bootFor("truth-is-out-there", false)).toBe("tracker");
  expect(bootFor("cartridge-blast", false)).toBe("cartridge");
  expect(bootFor("slime-time", false)).toBe("wipe");
  expect(bootFor("memphis-pop", false)).toBe("drop");
  expect(bootFor("nope", false)).toBe("drop");
});

test("reduced motion is always a plain fade", () => {
  expect(bootFor("colonial-marine", true)).toBe("fade");
  expect(bootFor("memphis-pop", true)).toBe("fade");
});

test("every variant fits in 2.5 s", () => {
  expect(BOOT_MS).toBeLessThanOrEqual(2500);
});
