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
