import { useState } from "react";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Dialog } from "../overlays/Dialog";

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

/** Ask for a preset name. */
export function NameDialog({
  open,
  title,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <Field label="Preset name" hint="Lowercase letters, digits, - and _">
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn">
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
