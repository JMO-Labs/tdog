import { useId } from "react";
import { Button } from "../components/ui/button";
import "./plugins.css";

/** A plugin held a command: run it anyway or cancel (Cancel is the default). */
export function GateConfirm(props: {
  plugin: string;
  reason: string;
  onDone: (run: boolean) => void;
}) {
  const id = useId();
  return (
    <div
      className="gate-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-r`}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") props.onDone(false);
      }}
    >
      <p id={`${id}-t`} className="gate-confirm-title">
        {props.plugin} paused this command
      </p>
      <p id={`${id}-r`} className="gate-confirm-reason">
        {props.reason || "It asked you to confirm before running it."}
      </p>
      <div className="gate-confirm-actions">
        <Button autoFocus variant="primary" onClick={() => props.onDone(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => props.onDone(true)}>
          Run anyway
        </Button>
      </div>
    </div>
  );
}
