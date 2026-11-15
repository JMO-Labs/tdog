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
export function useBroadcast(sceneId: string, paneId: string) {
  const [isBroadcasting, setIsBroadcasting] = useState(() =>
    getBroadcastGroup(sceneId).has(paneId),
  );

  // Subscribe to store changes
  useEffect(() => {
    return getBroadcastStore().subscribe(() => {
      setIsBroadcasting(getBroadcastGroup(sceneId).has(paneId));
    });
  }, [sceneId, paneId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isBroadcasting) {
        clearPane(sceneId, paneId);
      }
    };
  }, [isBroadcasting, sceneId, paneId]);

  return {
    isBroadcasting,
    toggle: () => {
      toggleBroadcast(sceneId, paneId);
    },
  };
}
