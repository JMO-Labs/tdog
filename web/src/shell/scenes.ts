/** Scene tab list: pure state transitions plus localStorage persistence. */
export type Scene = { id: string; name: string };
export type SceneState = { scenes: Scene[]; active: string };

const KEY = "tdog.scenes";
/** First scene keeps this id so its saved layout key stays valid. */
const FIRST: Scene = { id: "scene 1", name: "scene 1" };
const fresh = (): SceneState => ({ scenes: [FIRST], active: FIRST.id });

export function addScene(s: SceneState, id: string): SceneState {
  const scene = { id, name: `scene ${s.scenes.length + 1}` };
  return { scenes: [...s.scenes, scene], active: id };
}

/** Append a scene tab with a given name and activate it. */
export function addNamedScene(
  s: SceneState,
  id: string,
  name: string,
): SceneState {
  return { scenes: [...s.scenes, { id, name }], active: id };
}

export function renameScene(
  s: SceneState,
  id: string,
  name: string,
): SceneState {
  const n = name.trim();
  if (!n) return s;
  return {
    ...s,
    scenes: s.scenes.map((x) => (x.id === id ? { ...x, name: n } : x)),
  };
}

/** Remove a scene; the last one never closes. Neighbour takes over if active. */
export function closeScene(s: SceneState, id: string): SceneState {
  const i = s.scenes.findIndex((x) => x.id === id);
  if (i < 0 || s.scenes.length < 2) return s;
  const scenes = s.scenes.filter((x) => x.id !== id);
  const active =
    s.active === id ? scenes[Math.min(i, scenes.length - 1)].id : s.active;
  return { scenes, active };
}

export function reorderScene(
  s: SceneState,
  id: string,
  to: number,
): SceneState {
  const from = s.scenes.findIndex((x) => x.id === id);
  if (from < 0) return s;
  const scenes = [...s.scenes];
  const [m] = scenes.splice(from, 1);
  scenes.splice(Math.max(0, Math.min(to, scenes.length)), 0, m);
  return { ...s, scenes };
}

export function saveScenes(s: SceneState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota: tabs just won't persist */
  }
}

const isScene = (v: unknown): v is Scene =>
  !!v &&
  typeof (v as Scene).id === "string" &&
  typeof (v as Scene).name === "string";

export function loadScenes(): SceneState {
  try {
    const v = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as SceneState | null;
    if (!v || !Array.isArray(v.scenes) || !v.scenes.length) return fresh();
    if (!v.scenes.every(isScene)) return fresh();
    const active = v.scenes.some((x) => x.id === v.active)
      ? v.active
      : v.scenes[0].id;
    return { scenes: v.scenes, active };
  } catch {
    return fresh();
  }
}
