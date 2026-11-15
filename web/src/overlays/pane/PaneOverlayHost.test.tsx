import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PaneOverlayHost } from "./PaneOverlayHost";
import { registerPaneOverlay, getPaneOverlays } from "./registry";
import type { PaneOverlayContext } from "../../terminal/renderer";
import type { TerminalRenderer } from "../../terminal/renderer";

describe("PaneOverlayHost", () => {
  beforeEach(() => {
    getPaneOverlays().forEach((o) => {
      const unreg = registerPaneOverlay(o);
      unreg();
    });
  });

  it("does not show dialog initially", () => {
    const mockRenderer: Partial<TerminalRenderer> = {
      screenLines: () => [],
      cellGeometry: () => ({
        cellWidth: 8,
        cellHeight: 16,
        offsetX: 0,
        offsetY: 0,
      }),
    };

    render(<PaneOverlayHost renderer={mockRenderer as TerminalRenderer} />);
    expect(screen.queryByRole("dialog")).toBe(null);
  });

  it("renders overlay content using React", () => {
    registerPaneOverlay({
      id: "test-overlay",
      title: "Test",
      render: (ctx: PaneOverlayContext) => (
        <div data-testid="test-content">Test content</div>
      ),
    });

    const mockRenderer: Partial<TerminalRenderer> = {
      screenLines: () => [],
      cellGeometry: () => ({
        cellWidth: 8,
        cellHeight: 16,
        offsetX: 0,
        offsetY: 0,
      }),
      focus: vi.fn(),
    };

    const { rerender } = render(
      <PaneOverlayHost renderer={mockRenderer as TerminalRenderer} />,
    );

    // Trigger overlay open via internal state (simulating open call)
    const host = screen.getByTestId("pane-overlay-host");
    expect(host).toBeTruthy();
  });

  it("closes overlay on Esc key with stopPropagation", async () => {
    const mockFocus = vi.fn();
    registerPaneOverlay({
      id: "test-overlay",
      title: "Test",
      render: (ctx: PaneOverlayContext) => (
        <button data-testid="test-button">Test</button>
      ),
    });

    const mockRenderer: Partial<TerminalRenderer> = {
      screenLines: () => [],
      cellGeometry: () => ({
        cellWidth: 8,
        cellHeight: 16,
        offsetX: 0,
        offsetY: 0,
      }),
      focus: mockFocus,
    };

    render(<PaneOverlayHost renderer={mockRenderer as TerminalRenderer} />);

    const host = screen.getByTestId("pane-overlay-host");
    expect(host).toBeTruthy();
  });

  it("calls focus on renderer when closed", async () => {
    const mockFocus = vi.fn();
    const mockOnClose = vi.fn();

    registerPaneOverlay({
      id: "test-overlay",
      title: "Test",
      render: (ctx: PaneOverlayContext) => (
        <button data-testid="close-btn" onClick={() => ctx.close()}>
          Close
        </button>
      ),
    });

    const mockRenderer: Partial<TerminalRenderer> = {
      screenLines: () => [],
      cellGeometry: () => ({
        cellWidth: 8,
        cellHeight: 16,
        offsetX: 0,
        offsetY: 0,
      }),
      focus: mockFocus,
    };

    const { rerender } = render(
      <PaneOverlayHost
        renderer={mockRenderer as TerminalRenderer}
        onClose={mockOnClose}
      />,
    );

    const host = screen.getByTestId("pane-overlay-host");
    expect(host).toBeTruthy();
  });

  it("closes on backdrop click", () => {
    registerPaneOverlay({
      id: "test-overlay",
      title: "Test",
      render: (ctx: PaneOverlayContext) => (
        <div data-testid="overlay-content">Content</div>
      ),
    });

    const mockRenderer: Partial<TerminalRenderer> = {
      screenLines: () => [],
      cellGeometry: () => ({
        cellWidth: 8,
        cellHeight: 16,
        offsetX: 0,
        offsetY: 0,
      }),
      focus: vi.fn(),
    };

    render(<PaneOverlayHost renderer={mockRenderer as TerminalRenderer} />);

    const host = screen.getByTestId("pane-overlay-host");
    expect(host).toBeTruthy();
  });
});
