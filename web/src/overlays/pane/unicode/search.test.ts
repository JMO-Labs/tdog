import { describe, it, expect } from "vitest";
import { search, parseCodepoint, filterByCategory } from "./search";
import type { UnicodeChar } from "./data";

const testChars: UnicodeChar[] = [
  {
    char: "👍",
    codepoint: "1F44D",
    name: "thumbs up",
    keywords: ["thumbs", "yes", "good"],
    category: "emoji",
  },
  {
    char: "✓",
    codepoint: "2713",
    name: "check mark",
    keywords: ["checkmark", "yes", "correct"],
    category: "symbol",
  },
  {
    char: "→",
    codepoint: "2192",
    name: "rightwards arrow",
    keywords: ["arrow", "right"],
    category: "symbol",
  },
  {
    char: "🚀",
    codepoint: "1F680",
    name: "rocket",
    keywords: ["launch", "space"],
    category: "emoji",
  },
];

describe("search", () => {
  it("returns all chars with empty query", () => {
    const results = search("", testChars);
    expect(results).toHaveLength(4);
  });

  it("finds by exact name match", () => {
    const results = search("thumbs up", testChars);
    expect(results).toHaveLength(1);
    expect(results[0].char.char).toBe("👍");
    expect(results[0].score).toBe(900);
  });

  it("finds by name prefix", () => {
    const results = search("check", testChars);
    expect(results).toHaveLength(1);
    expect(results[0].char.char).toBe("✓");
    expect(results[0].score).toBe(800);
  });

  it("finds by keyword exact match", () => {
    const results = search("arrow", testChars);
    expect(results).toHaveLength(1);
    expect(results[0].char.char).toBe("→");
    // "arrow" is a keyword and "rightwards arrow" contains it as word, so max score applies
    expect(results[0].score).toBeGreaterThanOrEqual(600);
  });

  it("finds by partial keyword match", () => {
    const results = search("rrow", testChars);
    expect(results).toHaveLength(1);
    expect(results[0].char.char).toBe("→");
  });

  it("ranks by score", () => {
    const results = search("right", testChars);
    expect(results).toHaveLength(1);
    expect(results[0].char.char).toBe("→");
  });

  it("is case insensitive", () => {
    const results = search("THUMBS UP", testChars);
    expect(results).toHaveLength(1);
    expect(results[0].char.char).toBe("👍");
  });

  it("returns empty for non-matching query", () => {
    const results = search("nonexistent", testChars);
    expect(results).toHaveLength(0);
  });

  it("finds multiple matches and ranks them", () => {
    const results = search("yes", testChars);
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Both have "yes" as keyword but one matches better
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });
});

describe("parseCodepoint", () => {
  it("parses U+XXXX format", () => {
    expect(parseCodepoint("U+1F44D")).toBe("1F44D");
  });

  it("parses lowercase U+XXXX", () => {
    expect(parseCodepoint("u+1f44d")).toBe("1F44D");
  });

  it("parses hex without prefix", () => {
    expect(parseCodepoint("1F44D")).toBe("1F44D");
  });

  it("parses 0xXXXX format", () => {
    expect(parseCodepoint("0x1F44D")).toBe("1F44D");
  });

  it("parses lowercase 0xXXXX", () => {
    expect(parseCodepoint("0x1f44d")).toBe("1F44D");
  });

  it("returns null for invalid input", () => {
    expect(parseCodepoint("invalid")).toBeNull();
    expect(parseCodepoint("GGG")).toBeNull();
  });

  it("handles whitespace", () => {
    expect(parseCodepoint("  U+1F44D  ")).toBe("1F44D");
  });

  it("searches by codepoint and returns exact match", () => {
    const results = search("U+1F44D", testChars);
    expect(results).toHaveLength(1);
    expect(results[0].char.char).toBe("👍");
    expect(results[0].score).toBe(1000);
  });

  it("searches by hex codepoint", () => {
    const results = search("2713", testChars);
    expect(results).toHaveLength(1);
    expect(results[0].char.char).toBe("✓");
    expect(results[0].score).toBe(1000);
  });
});

describe("filterByCategory", () => {
  it("filters emoji", () => {
    const results = search("", testChars);
    const emoji = filterByCategory(results, "emoji");
    expect(emoji).toHaveLength(2);
    expect(emoji.every((r) => r.char.category === "emoji")).toBe(true);
  });

  it("filters symbols", () => {
    const results = search("", testChars);
    const symbols = filterByCategory(results, "symbol");
    expect(symbols).toHaveLength(2);
    expect(symbols.every((r) => r.char.category === "symbol")).toBe(true);
  });
});
