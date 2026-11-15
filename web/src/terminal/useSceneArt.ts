import { createContext, useSyncExternalStore } from "react";
import { sceneArt, subscribeSceneArt } from "../presets/panes";

/** Whether the pane's scene opted in to theme art (motif + effects). */
export const SceneArtContext = createContext(false);

/** Live opt-in state of one scene. */
export const useSceneArt = (scene: string): boolean =>
  useSyncExternalStore(subscribeSceneArt, () => sceneArt(scene));
