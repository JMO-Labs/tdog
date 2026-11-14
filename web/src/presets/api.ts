import { apiFetch, apiPost, apiPut } from "../auth/api";

/** A server-side preset failure; `message` is plain text naming the field. */
export class PresetError extends Error {}

/** Resolved preset fields ("theme", "font.size", ...), see internal/config. */
export type Resolved = Record<string, { value: unknown; origin: string }>;
export type LayoutDto =
  | { type: "pane"; pane: string }
  | {
      type: "split";
      dir: "row" | "col";
      ratio: number;
      a: LayoutDto;
      b: LayoutDto;
    };
export type SceneRun = {
  scene: string;
  name: string;
  existing: boolean;
  panes: { pane: string; session: string }[];
  layout?: LayoutDto;
};

async function check(r: Response): Promise<Response> {
  if (r.ok) return r;
  let msg = "";
  try {
    const t = (await r.text()).trim();
    try {
      msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t;
    }
  } catch {
    /* unreadable body */
  }
  throw new PresetError(msg || `request failed (${r.status})`);
}

export async function listPresets(
  kind: "terminal" | "scene",
): Promise<string[]> {
  const r = await check(await apiFetch(`/api/presets/${kind}`));
  return ((await r.json()) as string[] | null) ?? [];
}

/** Resolve a terminal preset; rejects with the server's validation message. */
export async function resolvePreset(name: string): Promise<Resolved> {
  const q = new URLSearchParams({ terminal: name });
  const r = await check(await apiFetch(`/api/presets/resolve?${q}`));
  return (await r.json()) as Resolved;
}

export async function startScene(name: string): Promise<SceneRun> {
  const r = await check(
    await apiPost(`/api/scenes/${encodeURIComponent(name)}/start`),
  );
  return (await r.json()) as SceneRun;
}

export async function putScenePreset(
  name: string,
  toml: string,
): Promise<void> {
  const path = `/api/presets/scene/${encodeURIComponent(name)}`;
  await check(await apiPut(path, toml));
}
