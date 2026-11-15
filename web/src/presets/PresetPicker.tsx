import { useState } from "react";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Dialog } from "../overlays/Dialog";
import { validName } from "./sceneSave";

/** Modal list of preset names; picking one closes it. */
export function PresetPicker({
  open,
  title,
  names,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  names: string[];
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <ul className="preset-list" aria-label={title}>
        {names.map((n) => (
          <li key={n}>
            <button className="btn" onClick={() => onPick(n)}>
              {n}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Ask for a preset name; an existing name needs a second, explicit confirm. */
export function NameDialog({
  open,
  title,
  existing = [],
  initial = "",
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  existing?: string[];
  initial?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const n = name.trim();
  const bad = n !== "" && !validName(n);
  const clash = !bad && existing.includes(n);
  const [armed, setArmed] = useState("");
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!n || bad) return;
          if (clash && armed !== n) return setArmed(n);
          onSave(n);
        }}
      >
        <Field label="Preset name" hint="Lowercase letters, digits, - and _">
          <Input
            value={name}
            autoFocus
            aria-invalid={bad || undefined}
            onChange={(e) => {
              setName(e.target.value);
              setArmed("");
            }}
          />
        </Field>
        {bad && (
          <p role="alert" className="muted">
            Use lowercase letters, digits, - and _ (start with a letter or
            digit).
          </p>
        )}
        {clash && (
          <p role="alert">
            {armed === n
              ? `Overwrite "${n}"? Press Overwrite to confirm.`
              : `"${n}" already exists.`}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={bad || !n}>
            {clash ? "Overwrite" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
