import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaneOverlayContext } from "../../terminal/renderer";
import type { TerminalRenderer } from "../../terminal/renderer";
import { getPaneOverlay } from "./registry";
import { setFocusedPaneOverlay } from "./focusedPane";
import "./overlay.css";

export interface PaneOverlayHostProps {
  renderer: TerminalRenderer | null;
  onClose?: () => void;
}

export interface PaneOverlayHostHandle {
  open: (overlayId: string) => void;
}

export const PaneOverlayHost = ({
  renderer,
  onClose: onCloseCallback,
}: PaneOverlayHostProps) => {
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    };
  }, [overlayId, renderer, close]);

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

  // Store handle for external access
  const hostHandle = useRef<PaneOverlayHostHandle>({ open });
  hostHandle.current.open = open;

  // Set this pane's overlay opener as focused when container receives focus
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const handleFocus = () => {
      setFocusedPaneOverlay(open);
    };

    container.addEventListener("focusin", handleFocus);
    return () => {
      container.removeEventListener("focusin", handleFocus);
    };
  }, [open]);

  const overlay = overlayId ? getPaneOverlay(overlayId) : null;
  const renderedContent = overlay && ctx ? overlay.render(ctx) : null;

  return (
    <div data-testid="pane-overlay-host" className="pane-overlay-host">
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
