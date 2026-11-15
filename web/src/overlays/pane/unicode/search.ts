import type { UnicodeChar } from "./data";

export interface SearchResult {
  char: UnicodeChar;
  score: number; // Higher is better
}

/** Parse code point from various formats: U+1F680, 1f680, 0x2713, etc. */
export function parseCodepoint(input: string): string | null {
  const clean = input.trim().toUpperCase();

  // Try U+XXXX format
  if (clean.match(/^U\+[0-9A-F]+$/)) {
    return clean.slice(2);
  }

  // Try hex without prefix
  if (clean.match(/^[0-9A-F]+$/)) {
    return clean;
  }

  // Try 0xXXXX format
  if (clean.match(/^0X[0-9A-F]+$/)) {
    return clean.slice(2);
  }

  return null;
}

/** Search characters by query (name, keywords, or codepoint). */
export function search(query: string, chars: UnicodeChar[]): SearchResult[] {
  if (!query.trim()) {
    return chars.map((char) => ({ char, score: 0 }));
  }

  const q = query.toLowerCase().trim();

  // Check if it's a codepoint query
  const codepoint = parseCodepoint(q);
  if (codepoint) {
    const match = chars.find((c) => c.codepoint.toUpperCase() === codepoint);
    if (match) {
      return [{ char: match, score: 1000 }];
    }
    return [];
  }

  const results: SearchResult[] = [];

  for (const char of chars) {
    let score = 0;

    // Exact name match: highest score
    if (char.name.toLowerCase() === q) {
      score = 900;
    }
    // Name starts with query: high score
    else if (char.name.toLowerCase().startsWith(q)) {
      score = 800;
    }
    // Name contains query as word boundary: medium score
    else if (char.name.toLowerCase().includes(` ${q}`)) {
      score = 600;
    }
    // Name contains query as substring: lower score
    else if (char.name.toLowerCase().includes(q)) {
      score = 400;
    }

    // Check keywords: incrementally lower scores
    if (score === 0) {
      for (const keyword of char.keywords) {
        if (keyword === q) {
          score = Math.max(score, 700);
        } else if (keyword.startsWith(q)) {
          score = Math.max(score, 500);
        } else if (keyword.includes(q)) {
          score = Math.max(score, 300);
        }
      }
    }

    if (score > 0) {
      results.push({ char, score });
    }
  }

  // Sort by score descending, then by name for stability
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.char.name.localeCompare(b.char.name);
  });

  return results;
}

/** Get results for a specific category. */
export function filterByCategory(
  results: SearchResult[],
  category: "emoji" | "symbol",
): SearchResult[] {
  return results.filter((r) => r.char.category === category);
}
