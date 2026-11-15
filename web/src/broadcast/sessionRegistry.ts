/**
 * Simple registry for tracking TerminalSession instances by scene and pane ID.
 * Used by broadcast feature to fan out input to other panes.
 */

import type { TerminalSession } from "../terminal/session";

const sessions: Map<string, Map<string, TerminalSession>> = new Map();

export function registerSession(
  sceneId: string,
  paneId: string,
  session: TerminalSession,
): void {
  if (!sessions.has(sceneId)) {
    sessions.set(sceneId, new Map());
  }
  sessions.get(sceneId)!.set(paneId, session);
}

export function unregisterSession(sceneId: string, paneId: string): void {
  const scene = sessions.get(sceneId);
  if (scene) {
    scene.delete(paneId);
    if (scene.size === 0) {
      sessions.delete(sceneId);
    }
  }
}

export function getSession(
  sceneId: string,
  paneId: string,
): TerminalSession | undefined {
  return sessions.get(sceneId)?.get(paneId);
}

export function getSceneSessions(
  sceneId: string,
): Record<string, TerminalSession> {
  const result: Record<string, TerminalSession> = {};
  sessions.get(sceneId)?.forEach((session, paneId) => {
    result[paneId] = session;
  });
  return result;
}
