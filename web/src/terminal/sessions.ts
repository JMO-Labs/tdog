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

/** Hang up the shell behind a pane (best effort). */
export async function killScene(scene: string): Promise<void> {
  const id = await findSessionId(scene);
  if (!id) return;
  try {
    await apiPost(`/api/sessions/${id}/kill`);
  } catch {
    /* already gone */
  }
}
