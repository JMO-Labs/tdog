import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import type { Hook, HookMode } from "./terminalToml";

type Props = {
  label: string;
  hook: Hook | undefined;
  error?: string;
  onChange: (h: Hook | undefined) => void;
};

/** An ordered command chain with a run mode (pre_exec, post_exec, on_close). */
export function HookEditor({ label, hook, error, onChange }: Props) {
  const run = hook?.run ?? [];
  const mode = hook?.mode ?? "all";
  const emit = (r: string[], m: HookMode = mode) =>
    onChange(r.length ? { mode: m, run: r } : undefined);
  return (
    <div className="td-hook" role="group" aria-label={label}>
      <h4>{label}</h4>
      {run.length > 0 && (
        <Select
          aria-label={`${label} mode`}
          value={mode}
          onChange={(e) => emit(run, e.target.value as HookMode)}
        >
          <option value="all">Run every command</option>
          <option value="stop_on_fail">Stop on first failure</option>
        </Select>
      )}
      {run.map((c, i) => (
        <div className="td-env-row" key={i}>
          <Field
            label={`${label} command ${i + 1}`}
            error={i === 0 ? error : undefined}
          >
            <Input
              value={c}
              onChange={(e) =>
                emit(run.map((x, j) => (j === i ? e.target.value : x)))
              }
            />
          </Field>
          <Button
            aria-label={`Remove ${label} command ${i + 1}`}
            onClick={() => emit(run.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        aria-label={`Add ${label} command`}
        onClick={() => emit([...run, ""])}
      >
        Add command
      </Button>
    </div>
  );
}
