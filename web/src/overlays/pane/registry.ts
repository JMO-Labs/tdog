import type { PaneOverlayContext } from "../../terminal/renderer";

export type PaneOverlayRender = (ctx: PaneOverlayContext) => void;

export interface PaneOverlay {
  id: string;
  title: string;
  render: PaneOverlayRender;
}

const registry = new Map<string, PaneOverlay>();
const listeners = new Set<() => void>();

/** Register a pane overlay. Returns unregister function. */
export function registerPaneOverlay(overlay: PaneOverlay): () => void {
  registry.set(overlay.id, overlay);
  emit();
  return () => {
    if (registry.get(overlay.id) === overlay) {
      registry.delete(overlay.id);
      emit();
    }
  };
}

/** Get overlay by ID. */
export function getPaneOverlay(id: string): PaneOverlay | undefined {
  return registry.get(id);
}

/** Get all registered overlays. */
export function getPaneOverlays(): PaneOverlay[] {
  return [...registry.values()];
}

/** Subscribe to registry changes. */
export function subscribePaneOverlays(l: () => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

function emit(): void {
  listeners.forEach((l) => l());
}
