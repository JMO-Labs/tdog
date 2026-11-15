/**
 * Broadcast store: manages which panes are in the broadcast group per scene.
 * In-memory only: reload clears all groups (safety: prevents unknowing input to all panes).
 */

const groups: Map<string, Set<string>> = new Map();
const listeners = new Set<() => void>();

function getGroup(scene: string): Set<string> {
  if (!groups.has(scene)) {
    groups.set(scene, new Set());
  }
  return groups.get(scene)!;
}

/**
 * Toggle a pane in/out of the broadcast group for a scene.
 */
export function toggleBroadcast(scene: string, paneId: string): void {
  const group = getGroup(scene);
  if (group.has(paneId)) {
    group.delete(paneId);
  } else {
    group.add(paneId);
  }
  listeners.forEach((l) => l());
}

/** True when the scene has panes and every one is in the group. */
export function isSceneBroadcasting(scene: string, paneIds: string[]): boolean {
  const group = getGroup(scene);
  return paneIds.length > 0 && paneIds.every((id) => group.has(id));
}

/**
 * Scene-wide toggle: if any pane is not broadcasting, put all in; else clear.
 */
export function toggleSceneBroadcast(scene: string, paneIds: string[]): void {
  if (isSceneBroadcasting(scene, paneIds)) {
    clearScene(scene);
    return;
  }
  const group = getGroup(scene);
  paneIds.forEach((id) => group.add(id));
  listeners.forEach((l) => l());
}

/**
 * Remove a pane from the broadcast group (e.g., when pane closes).
 */
export function clearPane(scene: string, paneId: string): void {
  const group = getGroup(scene);
  if (group.has(paneId)) {
    group.delete(paneId);
    listeners.forEach((l) => l());
  }
}

/**
 * Clear entire broadcast group for a scene (e.g., when scene closes).
 */
export function clearScene(scene: string): void {
  if (groups.has(scene)) {
    groups.delete(scene);
    listeners.forEach((l) => l());
  }
}

/**
 * Get the broadcast group for a scene (set of pane IDs).
 */
export function getBroadcastGroup(scene: string): Set<string> {
  return getGroup(scene);
}

/**
 * Subscribe to broadcast store changes.
 */
export function getBroadcastStore() {
  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

/**
 * Test helper: clear all in-memory state (for testing).
 */
export function __clearAllState(): void {
  groups.clear();
  listeners.clear();
}
