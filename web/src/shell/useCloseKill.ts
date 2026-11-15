import { useCallback, useRef, useState } from "react";
import { killScene } from "../terminal/sessions";
import { useSceneKill } from "./useSceneKill";
import type { PaneOpen } from "./PaneSlot";

type KillArgs = Parameters<typeof useSceneKill>;

/** Close-scene and kill dialogs: their state, targets and confirm handlers. */
export function useCloseKill(
  leafMap: KillArgs[0],
  scenes: KillArgs[1],
  active: string,
  setSc: KillArgs[2],
  setLeafMap: KillArgs[3],
  toast: KillArgs[4],
  c: KillArgs[5],
  paneOpen: Record<string, PaneOpen>,
) {
  const [closing, setClosing] = useState<string | null>(null);
  const [kill, setKill] = useState<string | null>(null); // "all" or scene id
  const { removeSceneCleanup, runKill: runKillImpl } = useSceneKill(
    leafMap,
    scenes,
    setSc,
    setLeafMap,
    toast,
    c,
  );

  const finishClose = useCallback(
    (id: string) => {
      (leafMap[id] ?? []).forEach((p) => void killScene(p));
      removeSceneCleanup(id);
    },
    [leafMap, removeSceneCleanup],
  );
  const requestClose = (id: string) => {
    const running = (leafMap[id] ?? []).some((p) => paneOpen[p]?.open);
    if (running) setClosing(id);
    else finishClose(id);
  };

  const closeActive = useRef<() => void>(() => {});
  closeActive.current = () => requestClose(active);

  const killTargets = (scope: string | null) =>
    (scope === "all"
      ? Object.values(leafMap).flat()
      : (leafMap[scope ?? ""] ?? [])
    ).filter((p) => paneOpen[p]?.open);
  const closingName = scenes.find((x) => x.id === closing)?.name ?? "";
  const closingCount = closing
    ? (leafMap[closing] ?? []).filter((p) => paneOpen[p]?.open).length
    : 0;

  const runKill = async () => {
    const targets = killTargets(kill);
    setKill(null);
    // Nothing running (all disconnected): just remove the scene.
    if (!targets.length && kill && kill !== "all") return finishClose(kill);
    void runKillImpl(targets);
  };

  return {
    closing,
    setClosing,
    kill,
    setKill,
    finishClose,
    requestClose,
    closeActive,
    killTargets,
    closingName,
    closingCount,
    runKill,
  };
}
