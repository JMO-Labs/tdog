import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaneOverlayContext } from "../../terminal/renderer";
import type { TerminalRenderer } from "../../terminal/renderer";
import { getPaneOverlay } from "./registry";
import { clearFocusedPaneOverlay, setFocusedPaneOverlay } from "./focusedPane";
import "./overlay.css";

export interface PaneOverlayHostProps {
  renderer: TerminalRenderer | null;
  onClose?: () => void;
  /** Filled with this host's `open`, for the pane's own menu. */
  handle?: { current: PaneOverlayHostHandle };
  sessionId?: string;
  cwd?: string;
}

export interface PaneOverlayHostHandle {
  open: (overlayId: string) => void;
}

export const PaneOverlayHost = ({
  renderer,
  onClose: onCloseCallback,
  handle,
  sessionId,
  cwd,
}: PaneOverlayHostProps) => {
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hostDiv = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOverlayId(null);
    onCloseCallback?.();
    renderer?.focus?.();
  }, [renderer, onCloseCallback]);

  const open = useCallback((id: string) => {
    const overlay = getPaneOverlay(id);
    if (!overlay) return;
    setOverlayId(id);
  }, []);

  // Build context once when overlay opens, keyed on overlayId
  const ctx: PaneOverlayContext | null = useMemo(() => {
    if (!overlayId) return null;

    const screen = renderer?.screenLines?.() ?? [];
    const cellGeometry = renderer?.cellGeometry?.() ?? {
      cellWidth: 0,
      cellHeight: 0,
      offsetX: 0,
      offsetY: 0,
    };

    return {
      screen,
      cellGeometry,
      insert: (text: string) => {
        renderer?.paste?.(text);
        close();
      },
      copy: (text: string) => {
        void navigator.clipboard.writeText(text).catch(() => {});
        close();
      },
      open: (url: string) => {
        window.open(url, "_blank");
        close();
      },
      close,
      sessionId,
      cwd,
    };
  }, [overlayId, renderer, close, sessionId, cwd]);

  // Handle keyboard: Esc closes, Tab traps focus, no other keys reach xterm
  useEffect(() => {
    if (!overlayId || !containerRef.current) return;

    const container = containerRef.current;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === "Tab") {
        const focusable = container.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        if (focusable.length === 0) return;

        const active = document.activeElement as HTMLElement;
        const activeIdx = Array.from(focusable).indexOf(active);

        if (e.shiftKey && activeIdx <= 0) {
          e.preventDefault();
          focusable[focusable.length - 1]?.focus();
        } else if (!e.shiftKey && activeIdx >= focusable.length - 1) {
          e.preventDefault();
          focusable[0]?.focus();
        }
      } else {
        // All other keys stay in overlay, don't reach xterm
        e.stopPropagation();
      }
    };

    container.addEventListener("keydown", handleKeyDown, true);

    // Focus first focusable element
    const first = container.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    first?.focus();

    return () => {
      container.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [overlayId, close]);

  if (handle) handle.current = { open };

  // ⌘K acts on the pane that last had focus: track focus on the whole pane
  // (the host's parent), not just the overlay, which only exists while open.
  useEffect(() => {
    const pane = hostDiv.current?.parentElement;
    if (!pane) return;
    const onFocus = () => setFocusedPaneOverlay(open);
    pane.addEventListener("focusin", onFocus);
    return () => {
      pane.removeEventListener("focusin", onFocus);
      clearFocusedPaneOverlay(open);
    };
  }, [open]);

  const overlay = overlayId ? getPaneOverlay(overlayId) : null;
  const renderedContent = overlay && ctx ? overlay.render(ctx) : null;

  return (
    <div
      ref={hostDiv}
      data-testid="pane-overlay-host"
      className="pane-overlay-host"
    >
      {overlayId && (
        <div className="pane-overlay-backdrop" onClick={close}>
          <div
            ref={containerRef}
            className="pane-overlay-container"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.stopPropagation();
            }}
            role="dialog"
            aria-modal="true"
          >
            {renderedContent}
          </div>
        </div>
      )}
    </div>
  );
};

export function usePaneOverlayHost() {
  const hostRef = useRef<PaneOverlayHostHandle>({ open: () => {} });
  const openOverlay = (id: string) => hostRef.current.open(id);
  return { hostRef, openOverlay };
}
