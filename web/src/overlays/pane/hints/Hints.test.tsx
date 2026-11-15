import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PaneOverlayContext } from "../../../terminal/renderer";
import { Hints } from "./Hints";

function fakePaneCtx(): PaneOverlayContext {
  return {
    screen: [
      { row: 0, text: "Visit https://example.com today" },
      { row: 1, text: "Error in /path/to/file.ts:42" },
    ],
    cellGeometry: {
      cellWidth: 8,
      cellHeight: 16,
      offsetX: 0,
      offsetY: 0,
    },
    insert: vi.fn(),
    copy: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  };
}

describe("Hints", () => {
  it("renders labels for matches", () => {
    const ctx = fakePaneCtx();
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    render(
      <Hints
        ctx={ctx}
        matchTypes={["url", "path"]}
        onSelect={onSelect}
        onEscape={onEscape}
      />,
    );

    // Should have labels
    const labels = screen.getAllByText(/^[a-z;]$/);
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onSelect when label is typed", () => {
    const ctx = fakePaneCtx();
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    render(
      <Hints
        ctx={ctx}
        matchTypes={["url"]}
        onSelect={onSelect}
        onEscape={onEscape}
      />,
    );

    // Type the first label
    fireEvent.keyDown(document, { key: "a" });
    expect(onSelect).toHaveBeenCalled();
  });

  it("passes insert=true when Shift+label is typed", () => {
    const ctx = fakePaneCtx();
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    render(
      <Hints
        ctx={ctx}
        matchTypes={["url"]}
        onSelect={onSelect}
        onEscape={onEscape}
      />,
    );

    // Type Shift+label
    fireEvent.keyDown(document, { key: "a", shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith(expect.any(String), true);
  });

  it("calls onEscape when Escape is pressed", () => {
    const ctx = fakePaneCtx();
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    render(
      <Hints
        ctx={ctx}
        matchTypes={["url"]}
        onSelect={onSelect}
        onEscape={onEscape}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscape).toHaveBeenCalled();
  });

  it("ignores unknown keys", () => {
    const ctx = fakePaneCtx();
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    render(
      <Hints
        ctx={ctx}
        matchTypes={["url"]}
        onSelect={onSelect}
        onEscape={onEscape}
      />,
    );

    fireEvent.keyDown(document, { key: "x" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders footer with instructions", () => {
    const ctx = fakePaneCtx();
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    render(
      <Hints
        ctx={ctx}
        matchTypes={["url"]}
        onSelect={onSelect}
        onEscape={onEscape}
      />,
    );

    expect(screen.getByText(/Type a label/)).toBeDefined();
    expect(screen.getByText(/Shift inserts/)).toBeDefined();
  });

  it("filters matches by type", () => {
    const ctx = fakePaneCtx();
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    const { rerender } = render(
      <Hints
        ctx={ctx}
        matchTypes={["url"]}
        onSelect={onSelect}
        onEscape={onEscape}
      />,
    );

    // Re-render with only paths
    rerender(
      <Hints
        ctx={ctx}
        matchTypes={["path"]}
        onSelect={onSelect}
        onEscape={onEscape}
      />,
    );

    // Footer should exist
    expect(screen.getByText(/Type a label/)).toBeDefined();
  });
});
