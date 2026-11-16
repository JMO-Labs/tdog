import { useEffect, type RefObject } from "react";
import type { PaneMarker, TerminalRenderer } from "../terminal/renderer";
import { onJournalStart } from "./ingest";
import { registerPaneJump } from "./jump";

/**
 * Marks the cursor line when a command starts in this pane, keyed by rkey,
 * so search can scroll back to it. ponytail: the Journal frame may land
 * before/after its Output, so a marker can be a few lines off.
 */
export function useJournalMarkers(
  pane: string | undefined,
  renderer: RefObject<TerminalRenderer | null>,
  open: (id: string) => void,
) {
  useEffect(() => {
    if (!pane) return;
    const marks = new Map<string, PaneMarker>();
    const off = onJournalStart((p, sid, rec) => {
      if (p !== pane || marks.get(`${sid}/${rec}`)?.isDisposed === false)
        return;
      const m = renderer.current?.markLine?.();
      if (m) marks.set(`${sid}/${rec}`, m);
    });
    const unjump = registerPaneJump(pane, {
      open,
      scroll(rkey) {
        const m = marks.get(rkey);
        const r = renderer.current;
        if (!m || m.isDisposed || !r?.scrollToMarker) return false;
        r.scrollToMarker(m);
        setTimeout(() => r.focus?.(), 0); // after a scene switch shows the pane
        return true;
      },
    });
    return () => {
      off();
      unjump();
      marks.forEach((m) => m.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, renderer]);
}
