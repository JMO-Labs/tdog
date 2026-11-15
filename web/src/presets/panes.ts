import { findSessionId, sessionExists } from "../terminal/sessions";

/** Per-pane preset bookkeeping (client side; the server owns the presets). */
const KEY = "tdog.panePresets";

function read(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export const panePresets = read;
export const panePreset = (pane: string): string | undefined => read()[pane];

export function setPanePreset(pane: string, name: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [pane]: name }));
  } catch {
    /* storage unavailable: the pane just launches without its preset */
  }
}

/** Sessions a started scene preset made for its panes (pane id -> session). */
const bound = new Map<string, string>();
export const bindSession = (pane: string, session: string) =>
  void bound.set(pane, session);

/** Live session for a pane: its bound scene-preset session, else by pane key. */
export async function resolveSession(
  pane: string,
): Promise<string | undefined> {
  const b = bound.get(pane);
  if (b && (await sessionExists(b))) return b;
  bound.delete(pane);
  return findSessionId(pane);
}

/** Scene tab -> scene preset it was opened from (drives its background layer). */
const SCENE_KEY = "tdog.scenePresets";
function readScenes(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SCENE_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}
export const scenePreset = (tab: string): string | undefined =>
  readScenes()[tab];
export function setScenePreset(tab: string, name: string): void {
  try {
    localStorage.setItem(
      SCENE_KEY,
      JSON.stringify({ ...readScenes(), [tab]: name }),
    );
  } catch {
    /* storage unavailable: the scene just has no background */
  }
}

/** Per-pane terminal theme restored from a saved scene (beats the preset's). */
const THEME_KEY = "tdog.paneThemes";
function readThemes(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(THEME_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}
export const paneTheme = (pane: string): string | undefined =>
  readThemes()[pane];
export function setPaneTheme(pane: string, theme: string): void {
  try {
    localStorage.setItem(
      THEME_KEY,
      JSON.stringify({ ...readThemes(), [pane]: theme }),
    );
  } catch {
    /* storage unavailable: the pane keeps its preset theme */
  }
}

/** Per-pane zoom steps (1px each), kept across reloads. */
const ZOOM_KEY = "tdog.paneZoom";
export function paneZoom(pane: string): number {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? "{}")?.[
      pane
    ];
    return typeof v === "number" ? v : 0;
  } catch {
    return 0;
  }
}
export function setPaneZoom(pane: string, steps: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? "{}");
    if (steps) all[pane] = steps;
    else delete all[pane];
    localStorage.setItem(ZOOM_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: zoom lasts until reload */
  }
}

/** Scenes that opted in to theme art (terminal motif + effects); default off. */
const ART_KEY = "tdog.sceneArt";
const artListeners = new Set<() => void>();
export const subscribeSceneArt = (l: () => void) => (
  artListeners.add(l),
  () => void artListeners.delete(l)
);
function readArt(): Record<string, true> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ART_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, true>)
      : {};
  } catch {
    return {};
  }
}
export const sceneArt = (scene: string): boolean => readArt()[scene] === true;
export function setSceneArt(scene: string, on: boolean): void {
  const all = readArt();
  if (on) all[scene] = true;
  else delete all[scene];
  try {
    if (Object.keys(all).length)
      localStorage.setItem(ART_KEY, JSON.stringify(all));
    else localStorage.removeItem(ART_KEY);
  } catch {
    /* storage unavailable: the toggle just doesn't persist */
  }
  artListeners.forEach((l) => l());
}

/** Panes the user opted out of recording; only off panes are stored. */
const REC_KEY = "tdog.paneRecording";
function readRec(): Record<string, false> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(REC_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, false>)
      : {};
  } catch {
    return {};
  }
}
export const paneRecording = (pane: string): boolean =>
  readRec()[pane] !== false;
export function setPaneRecording(pane: string, on: boolean): void {
  const all = readRec();
  if (on) delete all[pane];
  else all[pane] = false;
  try {
    if (Object.keys(all).length)
      localStorage.setItem(REC_KEY, JSON.stringify(all));
    else localStorage.removeItem(REC_KEY);
  } catch {
    /* storage unavailable: the opt-out lasts until reload */
  }
}
