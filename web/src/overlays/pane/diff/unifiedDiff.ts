/** Export diff as unified diff format. */

import type { FileInfo, DiffHunk } from "./types";

/**
 * Convert a diff result to unified diff format (patch file).
 * This is the standard diff format used by patch, git, etc.
 */
export function toUnifiedDiff(
  pathA: string,
  pathB: string,
  hunks: DiffHunk[] | null,
): string {
  const lines: string[] = [];

  // Header with filenames and timestamps
  lines.push(`--- a/${pathA}`);
  lines.push(`+++ b/${pathB}`);

  if (!hunks || hunks.length === 0) {
    return lines.join("\n");
  }

  // Add each hunk with its header
  for (const hunk of hunks) {
    // Hunk header: @@ -aStart,aLines +bStart,bLines @@
    const aSpec =
      hunk.aLines === 1
        ? hunk.aStart.toString()
        : `${hunk.aStart},${hunk.aLines}`;
    const bSpec =
      hunk.bLines === 1
        ? hunk.bStart.toString()
        : `${hunk.bStart},${hunk.bLines}`;
    lines.push(`@@ -${aSpec} +${bSpec} @@`);

    // Lines: space (context), - (removed), + (added)
    for (const line of hunk.lines) {
      lines.push(line.op + line.text);
    }
  }

  return lines.join("\n");
}
