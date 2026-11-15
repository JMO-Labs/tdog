import { useEffect, useState } from "react";
import { listPresets } from "./api";

/** Terminal presets for the empty-pane state; hidden when there are none. */
export function EmptyPresets({ onPick }: { onPick: (name: string) => void }) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    listPresets("terminal").then(
      (n) => live && setNames(n),
      () => {}, // the empty state works without presets
    );
    return () => void (live = false);
  }, []);
  if (!names.length) return null;
  return (
    <div className="preset-list-wrap">
      <p className="muted">Or start from a preset:</p>
      <ul className="preset-list" aria-label="Terminal presets">
        {names.map((n) => (
          <li key={n}>
            <button className="btn" onClick={() => onPick(n)}>
              {n}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
