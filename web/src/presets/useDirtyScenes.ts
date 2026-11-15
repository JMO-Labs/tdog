import { useEffect, useState } from "react";
import { loadLayout, onAnyLayoutSave } from "../layout/store";
import { titleStore } from "../terminal/titles";
import { liveInfo } from "./liveInfo";
import { scenePreset } from "./panes";
import { getSave, isDirty, onSavesChange } from "./sceneSave";

/** Scene ids whose layout differs from the saved preset they came from. */
export function useDirtyScenes(ids: string[]): Set<string> {
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const key = ids.join("\n");
  useEffect(() => {
    const calc = () => {
      const next = new Set<string>();
      for (const id of key.split("\n")) {
        const name = scenePreset(id);
        const saved = name ? getSave(name) : undefined;
        const tree = loadLayout(id);
        if (saved && tree && isDirty(saved, tree, liveInfo)) next.add(id);
      }
      setDirty((cur) =>
        cur.size === next.size && [...next].every((x) => cur.has(x))
          ? cur
          : next,
      );
    };
    calc();
    const offs = [
      onAnyLayoutSave(calc),
      titleStore.subscribe(calc),
      onSavesChange(calc),
    ];
    return () => offs.forEach((f) => f());
  }, [key]);
  return dirty;
}
