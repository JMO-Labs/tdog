import { useEffect, useState } from "react";
import {
  toggleBroadcast,
  clearPane,
  getBroadcastGroup,
  getBroadcastStore,
} from "./store";

/**
 * Hook for managing broadcast state and cleanup for a pane.
 * Subscribes to store changes and cleans up on unmount.
 */
export function useBroadcast(sceneId?: string, paneId?: string) {
  const has = () =>
    !!sceneId && !!paneId && getBroadcastGroup(sceneId).has(paneId);
  const [isBroadcasting, setIsBroadcasting] = useState(has);

  useEffect(() => {
    setIsBroadcasting(has());
    return getBroadcastStore().subscribe(() => setIsBroadcasting(has()));
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
    toggle: () => {
      if (sceneId && paneId) toggleBroadcast(sceneId, paneId);
    },
  };
}
