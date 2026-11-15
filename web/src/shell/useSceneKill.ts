import { useCallback } from "react";
import { isKilled } from "../terminal/killed";
import { killScene } from "../terminal/sessions";
import { clearLayout } from "../layout/store";
import { clearScene } from "../broadcast/store";
import { newId } from "../layout/tree";
import { closeScene } from "./scenes";
import type { CopyKey } from "../copy/copy";
import type { ToastKind } from "../overlays/toast";

/**
 * Hook for killing shells and removing scenes when all panes are killed.
 */
export function useSceneKill(
  leafMap: Record<string, string[]>,
  paneOpen: Record<string, { open: boolean; everOpen: boolean }>,
  setSc: (f: (s: any) => any) => void,
  setLeafMap: (f: (m: any) => any) => void,
  toast: (kind: ToastKind, detail: string) => void,
  c: (key: CopyKey, vars?: Record<string, string | number>) => string,
) {
  /** Check if all panes in a scene are killed. */
  const allPanesKilled = useCallback(
    (sceneId: string): boolean => {
      const panes = leafMap[sceneId] ?? [];
      return panes.length > 0 && panes.every((p) => isKilled(p));
    },
    [leafMap],
  );

  /** Remove a scene without re-killing panes (for internal cleanup). */
  const removeSceneCleanup = useCallback(
    (id: string) => {
      clearLayout(id);
      clearScene(id);
      setLeafMap((m: Record<string, string[]>) => {
        const rest = { ...m };
        delete rest[id];
        return rest;
      });
      setSc((s: any) => closeScene(s, id, newId("sc")));
    },
    [setSc, setLeafMap],
  );

  /** Execute the kill and handle scene cleanup. */
  const runKill = useCallback(
    async (targets: string[]) => {
      const done = await Promise.all(targets.map((p) => killScene(p)));
      const n = done.reduce((a, b) => a + b, 0);

      // After killing, check which scenes have all panes killed and remove them
      let closedCount = 0;
      const targetSceneIds = new Set(
        Object.entries(leafMap)
          .filter(([_, panes]) => panes.some((p) => targets.includes(p)))
          .map(([sceneId]) => sceneId),
      );

      // Remove scenes where all panes are now killed
      targetSceneIds.forEach((sceneId) => {
        if (allPanesKilled(sceneId)) {
          removeSceneCleanup(sceneId);
          closedCount++;
        }
      });

      // Toast: report killed shells and closed scenes
      if (closedCount > 0) {
        toast(
          "success",
          c(closedCount === 1 ? "scene.closed1" : "scene.closed", {
            n,
            closed: closedCount,
          }),
        );
      } else {
        toast("success", c(n === 1 ? "kill.done1" : "kill.done", { n }));
      }
    },
    [leafMap, allPanesKilled, removeSceneCleanup, toast, c],
  );

  return { removeSceneCleanup, runKill };
}
