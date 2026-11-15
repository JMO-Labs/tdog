/** Types for the diff API and overlay. */

export interface DiffLine {
  op: " " | "-" | "+";
  text: string;
}

export interface DiffHunk {
  aStart: number;
  aLines: number;
  bStart: number;
  bLines: number;
  lines: DiffLine[];
}

export interface FileInfo {
  path: string;
  size: number;
}

export interface DiffResult {
  a: FileInfo;
  b: FileInfo;
  hunks: DiffHunk[] | null;
}

export interface DiffError {
  status: number;
  message: string;
}
