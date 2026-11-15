/**
 * Track which pane's overlay host is currently focused.
 * Used to open overlays from the ⌘K command palette.
 */

type OpenOverlayFunc = (id: string) => void;

let focusedPaneOverlay: OpenOverlayFunc | null = null;

export function setFocusedPaneOverlay(open: OpenOverlayFunc | null): void {
  focusedPaneOverlay = open;
}

export function openFocusedPaneOverlay(id: string): void {
  focusedPaneOverlay?.(id);
}
