import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "../overlays/Dialog";
import { usePref } from "../settings/prefs";
import { useCopy } from "../copy/copy";

/** How long the nuke button must be held. */
export const HOLD_MS = 1500;

type Props = {
  open: boolean;
  count: number;
  /** "all" or a scene name. */
  scope: string;
  onClose: () => void;
  onConfirm: () => void;
};

/** Kill dialog: zebra band, hold-to-nuke ring, shell count. */
export function KillDialog({ open, count, scope, onClose, onConfirm }: Props) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirm = useRef(onConfirm);
  confirm.current = onConfirm;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);
  const start = useCallback(() => {
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      confirm.current();
    }, HOLD_MS);
  }, []);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!open) cancel();
  }, [open, cancel]);

  const c = useCopy();
  const [serious] = usePref("serious");
  const what = `${count} shell${count === 1 ? "" : "s"}`;
  return (
    <Dialog
      open={open}
      title={c(scope === "all" ? "kill.titleAll" : "kill.titleScene", {
        scope,
      })}
      onClose={onClose}
    >
      {!serious && <div className="zebra" aria-hidden="true" />}
      <p>{c("kill.body", { what })}</p>
      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn danger nuke"
          data-holding={holding}
          onPointerDown={start}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          onBlur={cancel}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (!e.repeat) start();
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter") cancel();
          }}
        >
          <svg className="ring" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" pathLength="100" />
          </svg>
          {c("kill.hold")}
        </button>
      </div>
    </Dialog>
  );
}
