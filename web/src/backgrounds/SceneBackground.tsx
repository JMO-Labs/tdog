import { createContext, useEffect, useState, type ReactNode } from "react";
import { resolveScene, type Resolved } from "../presets/api";
import { scenePreset } from "../presets/panes";
import { BackgroundLayer } from "./BackgroundLayer";
import { bgSpec } from "./spec";

/** True under a scene that draws its own background: panes then go see-through. */
export const SceneBgContext = createContext(false);

/** Scene background behind every pane; panes show it through their opacity. */
export function SceneBackground({
  scene,
  children,
}: {
  scene: string;
  children: ReactNode;
}) {
  const name = scenePreset(scene);
  const [resolved, setResolved] = useState<Resolved>({});
  useEffect(() => {
    if (!name) return;
    let live = true;
    resolveScene(name).then(
      (r) => live && setResolved(r),
      () => {}, // the preset was validated when the scene opened
    );
    return () => void (live = false);
  }, [name]);
  const spec = bgSpec(resolved);
  return (
    <SceneBgContext.Provider value={spec !== null}>
      <BackgroundLayer spec={spec} />
      {children}
    </SceneBgContext.Provider>
  );
}
