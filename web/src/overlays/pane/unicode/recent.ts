const RECENT_KEY = "tdog.unicodeRecent";
const RECENT_MAX = 30;

/** Get recently inserted characters as a codepoint list. */
export function getRecent(): string[] {
  try {
    const data = localStorage.getItem(RECENT_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

/** Add a codepoint to the recent list (newest first, max 30). */
export function addRecent(codepoint: string): void {
  try {
    const recent = getRecent();
    const updated = [codepoint, ...recent.filter((c) => c !== codepoint)].slice(
      0,
      RECENT_MAX,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable: recent is best-effort
  }
}

/** Clear all recent items. */
export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // localStorage unavailable
  }
}
