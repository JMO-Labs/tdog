/**
 * Simple registry for tracking renderers by scene and pane ID.
 * Used by broadcast feature to fan out input to other panes.
 */

import type { TerminalRenderer } from "../terminal/renderer";

interface PaneEntry {
  send: (data: Uint8Array) => void;
}

const entries: Map<string, Map<string, PaneEntry>> = new Map();

export function registerPaneInput(
  sceneId: string,
  paneId: string,
  send: (data: Uint8Array) => void,
): void {
  if (!entries.has(sceneId)) {
    entries.set(sceneId, new Map());
  }
  entries.get(sceneId)!.set(paneId, { send });
}

export function unregisterPaneInput(sceneId: string, paneId: string): void {
  const scene = entries.get(sceneId);
  if (scene) {
    scene.delete(paneId);
    if (scene.size === 0) {
      entries.delete(sceneId);
    }
  }
}

export function getScenePanes(sceneId: string): Record<string, PaneEntry> {
  const result: Record<string, PaneEntry> = {};
  entries.get(sceneId)?.forEach((entry, paneId) => {
    result[paneId] = entry;
  });
  return result;
}

/**
 * Test helper: clear all entries (for testing).
 */
export function __clearAllEntries(): void {
  entries.clear();
}
