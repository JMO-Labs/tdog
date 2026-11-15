import { useCallback, useRef } from "react";
import { TerminalPane } from "../TerminalPane";
import { useCopy } from "../copy/copy";
import { Mascot } from "./Mascot";

/** Open state of one pane; owned by Workspace so it survives remounts. */
export type PaneOpen = { open: boolean; everOpen: boolean };

/** One pane's terminal plus its closed overlay and reconnect handle. */
export function PaneSlot({
  id,
  settled,
  visible,
  state,
  onOpenChange,
  onClosed,
  onSize,
  onOutput,
  onLatency,
  theme,
  sceneId,
  broadcastSessions,
}: {
  id: string;
  /** Terminal theme id; defaults to the page theme. */
  theme?: string;
  settled: boolean;
  /** False when the pane's scene is hidden. */
  visible?: boolean;
  state?: PaneOpen;
  onOpenChange: (id: string, open: boolean) => void;
  onClosed?: () => void;
  onSize: (id: string, cols: number, rows: number) => void;
  onOutput: (data?: Uint8Array) => void;
  onLatency: (id: string, ms: number) => void;
  /** Scene ID for broadcast feature. */
  sceneId?: string;
  /** Map of scene ID to pane ID to session for broadcast. */
  broadcastSessions?: Record<string, Record<string, any>>;
}) {
  const c = useCopy();
  const { open, everOpen } = state ?? { open: false, everOpen: false };
  const reconnectRef = useRef<(() => void) | null>(null);
  const onOpen = useCallback(
    (o: boolean) => onOpenChange(id, o),
    [id, onOpenChange],
  );
  const onSz = useCallback(
    (c: number, r: number) => onSize(id, c, r),
    [id, onSize],
  );
  const onLat = useCallback((ms: number) => onLatency(id, ms), [id, onLatency]);
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <TerminalPane
        sceneKey={id}
        theme={theme}
        settled={settled}
        visible={visible}
        onClosed={onClosed}
        onSize={onSz}
        onOutput={onOutput}
        onLatency={onLat}
        onOpenChange={onOpen}
        reconnectRef={reconnectRef}
        sceneId={sceneId}
        broadcastSessions={broadcastSessions}
      />
      {everOpen && !open && (
        <div className="empty">
          <Mascot />
          <p className="empty-big">{c("empty.offline")}</p>
          <p className="muted">
            {c("empty.offlineHint")} <kbd>⌘K</kbd>
            {c("empty.offlineHint2")}
          </p>
          <button
            className="btn reconnect"
            onClick={() => reconnectRef.current?.()}
          >
            {c("conn.reconnect")}
          </button>
        </div>
      )}
    </div>
  );
}
