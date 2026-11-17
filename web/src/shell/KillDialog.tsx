import { Dialog } from "../overlays/Dialog";
import { usePref } from "../settings/prefs";
import { useCopy } from "../copy/copy";

type Props = {
  open: boolean;
  count: number;
  /** "all" or a scene name. */
  scope: string;
  onClose: () => void;
  onConfirm: () => void;
};

/** Kill dialog: zebra band, shell count, one-click confirm. */
export function KillDialog({ open, count, scope, onClose, onConfirm }: Props) {
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
        <button className="btn danger" onClick={onConfirm}>
          {c("kill.confirm")}
        </button>
      </div>
    </Dialog>
  );
}
