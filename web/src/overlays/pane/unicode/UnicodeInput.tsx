import { useEffect, useRef, useState } from "react";
import type { PaneOverlayContext } from "../../../terminal/renderer";
import type { UnicodeChar } from "./data";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { SegmentedControl } from "../../../components/ui/segmented";
import { search, filterByCategory } from "./search";
import { getRecent, addRecent } from "./recent";
import "./unicode.css";

type Tab = "emoji" | "symbol" | "recent";

interface UnicodeInputProps {
  ctx: PaneOverlayContext;
  data: UnicodeChar[];
}

const COLS = 10;
const ROWS = 3;

export function UnicodeInput({ ctx, data }: UnicodeInputProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("emoji");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search results based on current tab
  const allResults = search(query, data);
  const recentCodepoints = getRecent();
  const recentChars = recentCodepoints
    .map((cp) => data.find((c) => c.codepoint === cp))
    .filter((c): c is UnicodeChar => !!c);

  const results =
    tab === "recent"
      ? recentChars.map((char) => ({ char, score: 0 }))
      : tab === "emoji"
        ? filterByCategory(allResults, "emoji")
        : filterByCategory(allResults, "symbol");

  const selectedResult = results[selectedIndex];

  // Grid display: show first COLS*ROWS items
  const gridItems = results.slice(0, COLS * ROWS);

  // Handle keyboard
  useEffect(() => {
    if (!containerRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Arrow keys for navigation
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedIndex((i) =>
          Math.min(i + 1, Math.max(0, gridItems.length - 1)),
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) =>
          Math.min(i + COLS, Math.max(0, gridItems.length - 1)),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - COLS, 0));
      }
      // Number keys 1-9 to select from first row
      else if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (idx < gridItems.length && idx < COLS) {
          setSelectedIndex(idx);
        }
      }
      // Enter to insert
      else if (e.key === "Enter") {
        if (selectedResult) {
          addRecent(selectedResult.char.codepoint);
          if (e.shiftKey) {
            ctx.copy(selectedResult.char.char);
          } else {
            ctx.insert(selectedResult.char.char);
          }
        }
      }
    };

    containerRef.current.addEventListener("keydown", handleKeyDown);
    return () =>
      containerRef.current?.removeEventListener("keydown", handleKeyDown);
  }, [gridItems, selectedResult, selectedIndex, ctx]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, tab, gridItems.length]);

  const handleInsert = () => {
    if (selectedResult) {
      addRecent(selectedResult.char.codepoint);
      ctx.insert(selectedResult.char.char);
    }
  };

  const handleCopy = () => {
    if (selectedResult) {
      addRecent(selectedResult.char.codepoint);
      ctx.copy(selectedResult.char.char);
    }
  };

  return (
    <div className="unicode-input-container" ref={containerRef}>
      <div className="unicode-header">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search by name, keyword, or code point (e.g., U+1F680, rocket)"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          autoFocus
          className="unicode-search"
        />
      </div>

      <div className="unicode-tabs">
        <SegmentedControl
          value={tab}
          onValueChange={(val) => setTab(val as Tab)}
          aria-label="Character category"
          options={[
            { value: "emoji", label: "Emoji" },
            { value: "symbol", label: "Symbols" },
            { value: "recent", label: "Recent" },
          ]}
        />
      </div>

      <div className="unicode-grid">
        {gridItems.length === 0 ? (
          <div className="unicode-empty">No results found</div>
        ) : (
          gridItems.map((result, idx) => (
            <button
              key={`${result.char.codepoint}-${idx}`}
              className={`unicode-cell ${idx === selectedIndex ? "selected" : ""}`}
              onClick={() => setSelectedIndex(idx)}
              onDoubleClick={handleInsert}
              title={result.char.name}
            >
              <span className="unicode-char">{result.char.char}</span>
              {idx < 9 && <span className="unicode-shortcut">{idx + 1}</span>}
            </button>
          ))
        )}
      </div>

      <div className="unicode-footer">
        {selectedResult ? (
          <div className="unicode-info">
            <span className="unicode-display">{selectedResult.char.char}</span>
            <div className="unicode-details">
              <div className="unicode-name">{selectedResult.char.name}</div>
              <div className="unicode-codepoint">
                U+{selectedResult.char.codepoint}
              </div>
            </div>
          </div>
        ) : (
          <div className="unicode-info">No selection</div>
        )}
      </div>

      <div className="unicode-actions">
        <Button onClick={handleInsert} disabled={!selectedResult}>
          Insert
        </Button>
        <Button onClick={handleCopy} disabled={!selectedResult} variant="ghost">
          Copy (⇧↩)
        </Button>
        <Button onClick={() => ctx.close()} variant="ghost">
          Close
        </Button>
      </div>

      <div className="unicode-help">
        <small>
          Arrow keys to navigate • 1-9 to select first row • Enter to insert •
          Shift+Enter to copy
        </small>
      </div>
    </div>
  );
}
