import { useCallback, useRef, useState } from "react";
import { TerminalPane } from "../TerminalPane";
import { Mascot } from "./Mascot";

/** One pane's terminal plus its own open/closed state and reconnect handle. */
export function PaneSlot({
  id,
  settled,
  onClosed,
  onSize,
  onOutput,
  onLatency,
}: {
  id: string;
  settled: boolean;
  onClosed?: () => void;
  onSize: (id: string, cols: number, rows: number) => void;
  onOutput: () => void;
  onLatency: (id: string, ms: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [everOpen, setEverOpen] = useState(false);
  const reconnectRef = useRef<(() => void) | null>(null);
  const onOpenChange = useCallback((o: boolean) => {
    setOpen(o);
    if (o) setEverOpen(true);
  }, []);
  const onSz = useCallback(
    (c: number, r: number) => onSize(id, c, r),
    [id, onSize],
  );
  const onLat = useCallback((ms: number) => onLatency(id, ms), [id, onLatency]);
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <TerminalPane
        sceneKey={id}
        settled={settled}
        onClosed={onClosed}
        onSize={onSz}
        onOutput={onOutput}
        onLatency={onLat}
        onOpenChange={onOpenChange}
        reconnectRef={reconnectRef}
      />
      {everOpen && !open && (
        <div className="empty">
          <Mascot />
          <p className="empty-big">Nothing playing.</p>
          <p className="muted">
            Reconnect, or press <kbd>⌘K</kbd> for commands.
          </p>
          <button
            className="btn reconnect"
            onClick={() => reconnectRef.current?.()}
          >
            Reconnect
          </button>
        </div>
      )}
    </div>
  );
}
