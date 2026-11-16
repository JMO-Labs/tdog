import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import type { PaneOverlayContext } from "../terminal/renderer";
import { pendingRecord, readRecord } from "./jump";
import type { JournalRecord } from "./types";

/** Full stored record, for hits whose terminal line is no longer in the buffer. */
export function RecordOverlay(ctx: PaneOverlayContext) {
  const [rec, setRec] = useState<JournalRecord | null | undefined>();
  useEffect(() => {
    const p = pendingRecord();
    let live = true;
    (p ? readRecord(p.pane, p.rkey) : Promise.resolve(undefined)).then(
      (r) => live && setRec(r ?? null),
      () => live && setRec(null),
    );
    return () => void (live = false);
  }, []);
  return (
    <div className="overlay-card">
      <h2>{rec ? `$ ${rec.cmd}` : "Command record"}</h2>
      <div className="overlay-text-area">
        <pre>
          {rec === undefined ? "Loading…" : rec ? rec.out : "Record not found."}
        </pre>
      </div>
      <div className="overlay-actions">
        {rec && <Button onClick={() => ctx.copy(rec.out)}>Copy output</Button>}
        <Button onClick={() => ctx.close()}>Close</Button>
      </div>
    </div>
  );
}
