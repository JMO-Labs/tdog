import { useEffect, useState } from "react";
import {
  toggleBroadcast,
  clearPane,
  getBroadcastGroup,
  getBroadcastStore,
  isSceneBroadcasting,
  toggleSceneBroadcast,
} from "./store";
import { getScenePanes } from "./sessionRegistry";

/**
 * Hook for managing broadcast state and cleanup for a pane.
 * Subscribes to store changes and cleans up on unmount.
 */
export function useBroadcast(sceneId?: string, paneId?: string) {
  const has = () =>
    !!sceneId && !!paneId && getBroadcastGroup(sceneId).has(paneId);
  const [isBroadcasting, setIsBroadcasting] = useState(has);
  const [, bump] = useState(0);
  const ids = () => (sceneId ? Object.keys(getScenePanes(sceneId)) : []);

  useEffect(() => {
    setIsBroadcasting(has());
    return getBroadcastStore().subscribe(() => {
      setIsBroadcasting(has());
      bump((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, paneId]);

  // A pane that unmounts (closed, killed, moved) leaves its group.
  useEffect(
    () => () => {
      if (sceneId && paneId) clearPane(sceneId, paneId);
    },
    [sceneId, paneId],
  );

  return {
    isBroadcasting,
    allBroadcasting: !!sceneId && isSceneBroadcasting(sceneId, ids()),
    toggleAll: () => {
      if (sceneId) toggleSceneBroadcast(sceneId, ids());
    },
    toggle: () => {
      if (sceneId && paneId) toggleBroadcast(sceneId, paneId);
    },
  };
}
