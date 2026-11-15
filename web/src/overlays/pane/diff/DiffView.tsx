import { useState, useCallback, useMemo } from "react";
import type { DiffResult } from "./types";
import { toUnifiedDiff } from "./unifiedDiff";
import "./diff.css";

export interface DiffViewProps {
  result: DiffResult;
  onBack: () => void;
  onClose: () => void;
  onCopy: (text: string) => void;
}

export function DiffView({ result, onBack, onClose, onCopy }: DiffViewProps) {
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0);

  const hunks = result.hunks || [];
  const hasHunks = hunks.length > 0;

  const unifiedDiff = useMemo(
    () => toUnifiedDiff(result.a.path, result.b.path, result.hunks),
    [result],
  );

  const handleCopyAsUnified = useCallback(() => {
    onCopy(unifiedDiff);
  }, [unifiedDiff, onCopy]);

  const handleNextHunk = useCallback(() => {
    if (currentHunkIndex < hunks.length - 1) {
      setCurrentHunkIndex(currentHunkIndex + 1);
    }
  }, [currentHunkIndex, hunks.length]);

  const handlePrevHunk = useCallback(() => {
    if (currentHunkIndex > 0) {
      setCurrentHunkIndex(currentHunkIndex - 1);
    }
  }, [currentHunkIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "n" || e.key === "ArrowDown") {
        e.preventDefault();
        handleNextHunk();
      } else if (e.key === "p" || e.key === "ArrowUp") {
        e.preventDefault();
        handlePrevHunk();
      }
    },
    [handleNextHunk, handlePrevHunk],
  );

  if (!hasHunks) {
    return (
      <div className="diff-overlay-container" onKeyDown={handleKeyDown}>
        <h2>Files are identical</h2>
        <p>{result.a.path}</p>
        <p>{result.b.path}</p>
        <div className="diff-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const currentHunk = hunks[currentHunkIndex];

  return (
    <div className="diff-overlay-container" onKeyDown={handleKeyDown}>
      <div className="diff-header">
        <h2>Diff</h2>
        <div className="diff-files">
          <div className="diff-file-a">- {result.a.path}</div>
          <div className="diff-file-b">+ {result.b.path}</div>
        </div>
      </div>

      <div className="diff-hunk-info">
        Hunk {currentHunkIndex + 1} of {hunks.length}
      </div>

      <div className="diff-hunk">
        <div className="diff-hunk-header">
          @@ -{currentHunk.aStart},{currentHunk.aLines} +{currentHunk.bStart},
          {currentHunk.bLines} @@
        </div>
        {currentHunk.lines.map((line, idx) => (
          <div
            key={idx}
            className={`diff-line diff-line-${line.op === "+" ? "add" : line.op === "-" ? "remove" : "context"}`}
            data-op={line.op}
          >
            <span className="diff-line-op">{line.op}</span>
            <span className="diff-line-text">{line.text}</span>
          </div>
        ))}
      </div>

      <div className="diff-nav">
        <button onClick={handlePrevHunk} disabled={currentHunkIndex === 0}>
          ↑ Previous (p)
        </button>
        <button
          onClick={handleNextHunk}
          disabled={currentHunkIndex >= hunks.length - 1}
        >
          Next (n) ↓
        </button>
      </div>

      <div className="diff-actions">
        <button onClick={handleCopyAsUnified}>Copy as unified diff</button>
        <button onClick={onBack}>Back</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
