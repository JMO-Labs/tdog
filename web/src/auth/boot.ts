import { findTheme } from "../theme/registry";
import type { BOOTS } from "../theme/schema";

const KEY = "tdog.booted";

/** True the first time it is called in a browser session (boot plays once). */
export function takeBoot(): boolean {
  try {
    if (sessionStorage.getItem(KEY) === "1") return false;
    sessionStorage.setItem(KEY, "1");
  } catch {
    // storage unavailable: play it, nothing to remember
  }
  return true;
}

export type BootId = (typeof BOOTS)[number];
/** Longest any variant may run, ms (also the auto-finish timer). */
export const BOOT_MS = 2400;

/** Variant for the page theme; reduced motion always gets a plain fade. */
export function bootFor(themeId: string, reduced: boolean): BootId | "fade" {
  if (reduced) return "fade";
  return findTheme(themeId)?.chrome.boot ?? "drop";
}
