import { useEffect, useState } from "react";
import { onJournalGap, onJournalOut } from "./ingest";

export type GapState =
  | { phase: "offer" | "restoring"; sid: string; rec: number }
  | { phase: "done" | "failed"; text: string };

const HIDE_MS = { done: 2500, failed: 6000 };

/** Tracks this pane's latest disconnect gap and the restore that follows. */
export function useGapBanner(pane: string | undefined) {
  const [st, setSt] = useState<GapState | null>(null);
  useEffect(() => {
    if (!pane) return;
    const offGap = onJournalGap((p, sid, rec, why) => {
      if (p !== pane) return;
      if (why === "disconnected") setSt({ phase: "offer", sid, rec });
      else if (why.startsWith("restore failed"))
        setSt((s) =>
          s?.phase === "restoring" && s.sid === sid
            ? { phase: "failed", text: why }
            : s,
        );
    });
    const offOut = onJournalOut((p, sid, rec) => {
      if (p !== pane) return;
      setSt((s) =>
        s?.phase === "restoring" && s.sid === sid && s.rec === rec
          ? { phase: "done", text: "Restored from host." }
          : s,
      );
    });
    return () => {
      offGap();
      offOut();
    };
  }, [pane]);
  const phase = st?.phase;
  useEffect(() => {
    if (phase !== "done" && phase !== "failed") return;
    const id = setTimeout(() => setSt(null), HIDE_MS[phase]);
    return () => clearTimeout(id);
  }, [phase, st]);
  return {
    state: st,
    restoring: () =>
      setSt((s) => (s?.phase === "offer" ? { ...s, phase: "restoring" } : s)),
    dismiss: () => setSt(null),
  };
}
