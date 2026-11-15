import { useCallback, useEffect, useRef } from "react";
import { isKilled, subscribeKilled } from "../terminal/killed";
import { killScene } from "../terminal/sessions";
import { clearLayout } from "../layout/store";
import { clearScene } from "../broadcast/store";
import { newId } from "../layout/tree";
import { closeScene, type Scene, type SceneState } from "./scenes";
import type { CopyKey } from "../copy/copy";
import type { ToastKind } from "../overlays/toast";

type SetState<T> = (f: (prev: T) => T) => void;

/**
 * Kills shells and removes a scene once every pane in it has been killed,
 * whatever did the killing (pane menu, right-click, tab menu, kill all, or
 * the server's "killed" signal). Shells that exit on their own don't count.
 */
export function useSceneKill(
  leafMap: Record<string, string[]>,
  scenes: Scene[],
  setSc: SetState<SceneState>,
  setLeafMap: SetState<Record<string, string[]>>,
  toast: (kind: ToastKind, detail: string) => void,
  c: (key: CopyKey, vars?: Record<string, string | number>) => string,
) {
  /** Remove a scene's tab and state without killing anything. */
  const removeSceneCleanup = useCallback(
    (id: string) => {
      clearLayout(id);
      clearScene(id);
      setLeafMap((m) => {
        const rest = { ...m };
        delete rest[id];
        return rest;
      });
      setSc((s) => closeScene(s, id, newId("sc")));
    },
    [setSc, setLeafMap],
  );

  const live = useRef({ leafMap, scenes, removeSceneCleanup, toast, c });
  live.current = { leafMap, scenes, removeSceneCleanup, toast, c };

  const sweep = useCallback(() => {
    const { leafMap: m, scenes: all, removeSceneCleanup: rm } = live.current;
    for (const [id, panes] of Object.entries(m)) {
      if (panes.length === 0 || !panes.every(isKilled)) continue;
      const name = all.find((s) => s.id === id)?.name ?? id;
      rm(id);
      live.current.toast("info", live.current.c("scene.gone", { name }));
    }
  }, []);

  // React to every kill, and to layouts that load with all panes already
  // killed (reload after a kill must not bring the tab back).
  useEffect(() => subscribeKilled(sweep), [sweep]);
  useEffect(sweep, [leafMap, sweep]);

  /** Kill these panes' shells; scene removal follows from the kill marks. */
  const runKill = useCallback(
    async (targets: string[]) => {
      const done = await Promise.all(targets.map((p) => killScene(p)));
      const n = done.reduce((a, b) => a + b, 0);
      toast("success", c(n === 1 ? "kill.done1" : "kill.done", { n }));
    },
    [toast, c],
  );

  return { removeSceneCleanup, runKill };
}
