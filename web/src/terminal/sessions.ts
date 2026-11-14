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

/** Hang up the shell behind a pane (best effort). True if a kill went out. */
export async function killScene(scene: string): Promise<boolean> {
  const id = await findSessionId(scene);
  if (!id) return false;
  try {
    await apiPost(`/api/sessions/${id}/kill`);
    return true;
  } catch {
    return false;
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
