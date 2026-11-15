import { describe, it, expect } from "vitest";
import { toUnifiedDiff } from "./unifiedDiff";
import type { DiffHunk } from "./types";

describe("toUnifiedDiff", () => {
  it("generates header for files without hunks", () => {
    const result = toUnifiedDiff("old.txt", "new.txt", null);
    expect(result).toBe("--- a/old.txt\n+++ b/new.txt");
  });

  it("generates header for empty hunks array", () => {
    const result = toUnifiedDiff("old.txt", "new.txt", []);
    expect(result).toBe("--- a/old.txt\n+++ b/new.txt");
  });

  it("formats single-line hunk specs without count", () => {
    const hunks: DiffHunk[] = [
      {
        aStart: 5,
        aLines: 1,
        bStart: 5,
        bLines: 1,
        lines: [{ op: " ", text: "line 5" }],
      },
    ];
    const result = toUnifiedDiff("old.txt", "new.txt", hunks);
    expect(result).toContain("@@ -5 +5 @@");
  });

  it("formats multi-line hunk specs with count", () => {
    const hunks: DiffHunk[] = [
      {
        aStart: 5,
        aLines: 3,
        bStart: 5,
        bLines: 4,
        lines: [
          { op: " ", text: "line 5" },
          { op: "-", text: "old 6" },
          { op: " ", text: "line 7" },
          { op: "+", text: "new 6" },
        ],
      },
    ];
    const result = toUnifiedDiff("old.txt", "new.txt", hunks);
    expect(result).toContain("@@ -5,3 +5,4 @@");
  });

  it("includes all line types with correct prefixes", () => {
    const hunks: DiffHunk[] = [
      {
        aStart: 1,
        aLines: 3,
        bStart: 1,
        bLines: 3,
        lines: [
          { op: " ", text: "same" },
          { op: "-", text: "removed" },
          { op: "+", text: "added" },
        ],
      },
    ];
    const result = toUnifiedDiff("old.txt", "new.txt", hunks);
    expect(result).toContain(" same");
    expect(result).toContain("-removed");
    expect(result).toContain("+added");
  });

  it("handles multiple hunks", () => {
    const hunks: DiffHunk[] = [
      {
        aStart: 1,
        aLines: 2,
        bStart: 1,
        bLines: 2,
        lines: [
          { op: "-", text: "a" },
          { op: "+", text: "b" },
        ],
      },
      {
        aStart: 10,
        aLines: 1,
        bStart: 10,
        bLines: 1,
        lines: [{ op: "-", text: "x" }],
      },
    ];
    const result = toUnifiedDiff("old.txt", "new.txt", hunks);
    const lines = result.split("\n");
    const hunkHeaders = lines.filter((l) => l.startsWith("@@"));
    expect(hunkHeaders).toHaveLength(2);
  });
});
