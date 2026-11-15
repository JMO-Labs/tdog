/**
 * Broadcast store: manages which panes are in the broadcast group per scene.
 * Persists to localStorage, notifies subscribers on changes.
 */

const key = (scene: string) => `tdog.broadcast.${scene}`;

const groups: Map<string, Set<string>> = new Map();
const listeners = new Set<() => void>();

function load(scene: string): Set<string> {
  if (!groups.has(scene)) {
    try {
      const raw = localStorage.getItem(key(scene));
      const arr = raw ? JSON.parse(raw) : [];
      groups.set(scene, new Set(arr));
    } catch {
      groups.set(scene, new Set());
    }
  }
  return groups.get(scene)!;
}

function save(scene: string): void {
  try {
    const arr = Array.from(load(scene));
    if (arr.length === 0) {
      localStorage.removeItem(key(scene));
    } else {
      localStorage.setItem(key(scene), JSON.stringify(arr));
    }
  } catch {
    /* private mode / quota: state won't persist */
  }
}

/**
 * Toggle a pane in/out of the broadcast group for a scene.
 */
export function toggleBroadcast(scene: string, paneId: string): void {
  const group = load(scene);
  if (group.has(paneId)) {
    group.delete(paneId);
  } else {
    group.add(paneId);
  }
  save(scene);
  listeners.forEach((l) => l());
}

/**
 * Remove a pane from the broadcast group (e.g., when pane closes).
 */
export function clearPane(scene: string, paneId: string): void {
  const group = load(scene);
  if (group.has(paneId)) {
    group.delete(paneId);
    save(scene);
    listeners.forEach((l) => l());
  }
}

/**
 * Clear entire broadcast group for a scene (e.g., when scene closes).
 */
export function clearScene(scene: string): void {
  if (groups.has(scene)) {
    groups.delete(scene);
    localStorage.removeItem(key(scene));
    listeners.forEach((l) => l());
  }
}

/**
 * Get the broadcast group for a scene (set of pane IDs).
 */
export function getBroadcastGroup(scene: string): Set<string> {
  return load(scene);
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
