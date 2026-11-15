import { useEffect, useRef, useState } from "react";
import type { TerminalRenderer } from "../../terminal/renderer";
import { getPaneOverlay } from "./registry";
import "./overlay.css";

export interface PaneOverlayHostProps {
  renderer: TerminalRenderer | null;
  onClose?: () => void;
}

export interface PaneOverlayHostHandle {
  open(overlayId: string): void;
}

export const PaneOverlayHost = ({
  renderer,
  onClose: onCloseCallback,
}: PaneOverlayHostProps) => {
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOverlayId(null);
    onCloseCallback?.();
    renderer?.focus?.();
  };

  const open = (id: string) => {
    const overlay = getPaneOverlay(id);
    if (!overlay) return;
    setOverlayId(id);
  };

  useEffect(() => {
    if (!overlayId) return;
    const overlay = getPaneOverlay(overlayId);
    if (!overlay || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = "";

    // Set global reference for overlay to access container
    (globalThis as any).__paneOverlayContainer = container;

    const screen = renderer?.screenLines?.() ?? [];
    const cellGeometry = renderer?.cellGeometry?.() ?? {
      cellWidth: 0,
      cellHeight: 0,
      offsetX: 0,
      offsetY: 0,
    };

    const ctx = {
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

    overlay.render(ctx);

    // Focus trap: keep focus in overlay, close on Esc
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
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
      }
    };

    container.addEventListener("keydown", onKeyDown);
    const first = container.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    first?.focus();

    return () => {
      container.removeEventListener("keydown", onKeyDown);
    };
  }, [overlayId, renderer]);

  // Store open function on host element for external access
  const hostHandle = useRef<PaneOverlayHostHandle>({ open });
  hostHandle.current.open = open;

  return (
    <div
      ref={hostRef}
      data-testid="pane-overlay-host"
      className="pane-overlay-host"
      style={{ display: overlayId ? "contents" : "none" }}
    >
      {overlayId && (
        <div className="pane-overlay-backdrop" onClick={close}>
          <div
            ref={containerRef}
            className="pane-overlay-container"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export function usePaneOverlayHost() {
  const hostRef = useRef<PaneOverlayHostHandle>({ open: () => {} });

  const openOverlay = (id: string) => {
    hostRef.current.open(id);
  };

  return { hostRef, openOverlay };
}
