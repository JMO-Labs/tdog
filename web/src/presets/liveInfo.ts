import { titleStore } from "../terminal/titles";
import { paneTheme, panePreset } from "./panes";
import type { SavedPane } from "./sceneSave";

/** What a pane is doing now: its preset, live cwd (OSC 7) and terminal theme. */
export function liveInfo(id: string): SavedPane {
  const i = titleStore.get(id);
  return {
    preset: panePreset(id),
    cwd: i?.cwd,
    theme: i?.theme ?? paneTheme(id),
  };
}
