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
