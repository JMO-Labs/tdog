/** Pattern matchers for hints overlay. */

export interface Match {
  type: "url" | "path" | "hash" | "ip" | "email" | "word";
  text: string;
  start: number;
  end: number;
}

/** Find all matches in text, no overlaps; longest match wins. */
export function findMatches(
  text: string,
  types: Match["type"][] = ["url", "path", "hash", "ip", "email", "word"],
): Match[] {
  const all: Match[] = [];

  if (types.includes("url")) all.push(...findUrls(text));
  if (types.includes("path")) all.push(...findPaths(text));
  if (types.includes("hash")) all.push(...findHashes(text));
  if (types.includes("ip")) all.push(...findIPs(text));
  if (types.includes("email")) all.push(...findEmails(text));
  if (types.includes("word")) all.push(...findWords(text));

  // Remove overlaps; longest match wins
  return resolveOverlaps(all);
}

function findUrls(text: string): Match[] {
  const matches: Match[] = [];
  const urlRe = /https?:\/\/[^\s<>()[\]{}]+|file:\/\/[^\s<>()[\]{}]*/gi;

  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text))) {
    let url = m[0];
    // Trim trailing punctuation (except :line:col)
    url = trimTrailingPunct(url);
    if (url.length < 8) continue; // Minimum viable URL

    // Balance parentheses
    const openCount = (url.match(/\(/g) || []).length;
    const closeCount = (url.match(/\)/g) || []).length;
    if (closeCount > openCount) {
      const excess = closeCount - openCount;
      url = url.slice(0, -excess);
    }

    matches.push({
      type: "url",
      text: url,
      start: m.index,
      end: m.index + url.length,
    });
  }
  return matches;
}

function findPaths(text: string): Match[] {
  const matches: Match[] = [];
  // Absolute paths: /path, relative: ./path, ~/path, with optional :line:col
  const pathRe =
    /(\/[^\s<>()[\]{}]*|~\/[^\s<>()[\]{}]*|\.\/[^\s<>()[\]{}]*)(?::(\d+))?(?::(\d+))?/g;

  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(text))) {
    const fullMatch = m[0];
    // Must have at least one '/' or ~/ or ./
    if (!/^[/~.]/.test(fullMatch) || fullMatch.length < 2) continue;

    matches.push({
      type: "path",
      text: fullMatch,
      start: m.index,
      end: m.index + fullMatch.length,
    });
  }
  return matches;
}

function findHashes(text: string): Match[] {
  const matches: Match[] = [];
  // Git hashes: 7-40 hex characters
  const hashRe = /\b[0-9a-f]{7,40}\b/gi;

  let m: RegExpExecArray | null;
  while ((m = hashRe.exec(text))) {
    matches.push({
      type: "hash",
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return matches;
}

function findIPs(text: string): Match[] {
  const matches: Match[] = [];
  // IPv4: a.b.c.d where a,b,c,d are 0-255
  const ipv4Re =
    /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = ipv4Re.exec(text))) {
    matches.push({
      type: "ip",
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // IPv6: simplified, matches common patterns like ::1, fe80::1, etc.
  const ipv6Re = /(?:\b|^)(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?:\b|$)/gi;
  while ((m = ipv6Re.exec(text))) {
    const match = m[0].trim();
    if (match.includes(":")) {
      matches.push({
        type: "ip",
        text: match,
        start: m.index + (m[0].length - match.length),
        end:
          m.index + m[0].length - (m[0].length - match.length - match.length),
      });
    }
  }

  return matches;
}

function findEmails(text: string): Match[] {
  const matches: Match[] = [];
  // Email: simple pattern
  const emailRe = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

  let m: RegExpExecArray | null;
  while ((m = emailRe.exec(text))) {
    matches.push({
      type: "email",
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return matches;
}

function findWords(text: string): Match[] {
  const matches: Match[] = [];
  // Words >= 4 chars
  const wordRe = /\b[a-z0-9_-]{4,}\b/gi;

  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text))) {
    matches.push({
      type: "word",
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return matches;
}

function resolveOverlaps(matches: Match[]): Match[] {
  if (matches.length === 0) return [];

  // Sort by start position, then by length (longest first)
  const sorted = matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end - (a.end - a.start - (b.end - b.start));
  });

  const result: Match[] = [];
  let lastEnd = -1;

  for (const m of sorted) {
    if (m.start >= lastEnd) {
      result.push(m);
      lastEnd = m.end;
    }
  }

  return result;
}

/** Trim trailing punctuation from URL, preserving :line:col if present. */
function trimTrailingPunct(url: string): string {
  // Don't trim if it ends with :digits (line/col marker)
  if (/:\d+$/.test(url)) return url;

  // Trim common trailing punctuation
  return url.replace(/[.,;:!?'")\]}]+$/, "");
}
