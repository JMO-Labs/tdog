import { describe, expect, it } from "vitest";
import { COPY, SLANG_WORDS, text } from "./copy";

describe("copy module", () => {
  const entries = Object.entries(COPY);
  it("has entries", () => expect(entries.length).toBeGreaterThan(5));
  it.each(entries)("%s has both variants", (_k, v) => {
    expect(v.fun.trim()).not.toBe("");
    expect(v.plain.trim()).not.toBe("");
  });
  it.each(entries)("%s plain is sober", (_k, v) => {
    expect(v.plain).not.toContain("!");
    for (const w of SLANG_WORDS) expect(v.plain.toLowerCase()).not.toContain(w);
    expect(v.plain[0]).toBe(v.plain[0].toUpperCase());
  });
  it("text picks variant and fills vars", () => {
    expect(text("kill.done", true, { n: 2 })).toBe("Killed 2 shells.");
    expect(text("auth.signedIn", true)).toBe("Signed in.");
    expect(text("auth.signedIn", false)).not.toBe("Signed in.");
  });
});
