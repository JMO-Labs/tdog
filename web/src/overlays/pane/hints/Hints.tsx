import { useEffect, useState } from "react";
import type { PaneOverlayContext } from "../../../terminal/renderer";
import type { Match } from "./matchers";
import { findMatches } from "./matchers";
import { generateLabels } from "./labelGenerator";
import "./hints.css";

export interface HintsProps {
  ctx: PaneOverlayContext;
  matchTypes: Match["type"][] | undefined;
  onSelect: (text: string, insert: boolean) => void;
  onEscape: () => void;
}

export function Hints({ ctx, matchTypes, onSelect, onEscape }: HintsProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    const text = ctx.screen.map((line) => line.text).join("\n");
    const found = findMatches(text, matchTypes);
    setMatches(found);
    setLabels(generateLabels(found.length));
  }, [ctx.screen, matchTypes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // ESC closes
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
        return;
      }

      // Find matching label
      let targetIdx = -1;
      if (labels.length <= 8 && labels.includes(key)) {
        // Single key label
        targetIdx = labels.indexOf(key);
      } else if (labels.length > 8) {
        // Two-letter label: collect first char, wait for second
        // For simplicity, we'll match single keys only for now
        const singleIdx = labels.indexOf(key);
        if (singleIdx >= 0) {
          targetIdx = singleIdx;
        }
      }

      if (targetIdx >= 0 && matches[targetIdx]) {
        const insert = e.shiftKey;
        e.preventDefault();
        onSelect(matches[targetIdx].text, insert);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [matches, labels, onSelect, onEscape]);

  return (
    <div className="hints-overlay">
      <div className="hints-container">
        {matches.map((match, idx) => {
          const label = labels[idx];
          const charWidth = ctx.cellGeometry.cellWidth;
          const charHeight = ctx.cellGeometry.cellHeight;
          const offsetX = ctx.cellGeometry.offsetX;
          const offsetY = ctx.cellGeometry.offsetY;

          // Find the match in the screen lines
          let targetRow = 0;
          let targetCol = 0;
          let lineIdx = 0;
          let charCount = 0;

          for (const line of ctx.screen) {
            const lineLen = line.text.length;
            if (charCount + lineLen > match.start) {
              targetRow = line.row;
              targetCol = match.start - charCount;
              break;
            }
            charCount += lineLen + 1; // +1 for newline
            lineIdx++;
          }

          const x = offsetX + targetCol * charWidth;
          const y =
            offsetY + (targetRow - (ctx.screen[0]?.row ?? 0)) * charHeight;

          return (
            <div
              key={idx}
              className="hints-match"
              style={{
                position: "absolute",
                left: x,
                top: y,
              }}
            >
              <span className="hints-label">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="hints-footer">
        Type a label · Shift inserts · Esc cancels
      </div>
    </div>
  );
}
