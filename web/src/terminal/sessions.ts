import { markKilled } from "./killed";
import { journalDB } from "../journal/db";
import { apiFetch, apiPost } from "../auth/api";
import { setPaneRecording } from "../presets/panes";

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
 * Also forgets the pane's browser journal (pane id = `scene` key, which is
 * stable across reloads since layouts persist it).
 */
export async function killScene(scene: string): Promise<number> {
  // Every pane close/kill path funnels here: drop its browser journal too.
  setPaneRecording(scene, true);
  void journalDB()
    ?.forget(scene)
    .catch(() => {});
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
