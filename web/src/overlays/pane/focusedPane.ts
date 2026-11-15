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

/** Forget `open` if it is still the focused one (its pane unmounted). */
export function clearFocusedPaneOverlay(open: OpenOverlayFunc): void {
  if (focusedPaneOverlay === open) focusedPaneOverlay = null;
}

let focusedScreen: (() => string[]) | null = null;

/** The focused pane's visible lines (for plugins with screen:read). */
export function setFocusedScreen(read: (() => string[]) | null): void {
  focusedScreen = read;
}
export function readFocusedScreen(): string[] {
  return focusedScreen?.() ?? [];
}
