import { markKilled } from "./killed";
import { apiFetch, apiPost } from "../auth/api";

/** Server session id for a pane's `scene` key, if its shell is still alive. */
export async function findSessionId(
  scene: string,
): Promise<string | undefined> {
  try {
    const r = await apiFetch("/api/sessions");
    if (!r.ok) return undefined;
    const list = (await r.json()) as { id: string; scene: string }[];
    return list.find((s) => s.scene === scene)?.id;
  } catch {
    return undefined;
  }
}

/**
 * Kill every shell behind a pane's `scene` key. Returns the server's real
 * count (0 on failure) and marks the pane killed so reload does not respawn.
 */
export async function killScene(scene: string): Promise<number> {
  try {
    const r = await apiPost(`/api/scenes/${encodeURIComponent(scene)}/kill`);
    if (!r.ok) return 0;
    const n = Number(((await r.json()) as { killed?: number }).killed ?? 0);
    if (n > 0) markKilled(scene);
    return n;
  } catch {
    return 0;
  }
}

/** True while the server still has session `id`. */
export async function sessionExists(id: string): Promise<boolean> {
  try {
    const r = await apiFetch("/api/sessions");
    if (!r.ok) return false;
    return ((await r.json()) as { id: string }[]).some((s) => s.id === id);
  } catch {
    return false;
  }
}
