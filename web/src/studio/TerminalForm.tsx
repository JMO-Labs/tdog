import type { ReactElement } from "react";
import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import type { Resolved } from "../presets/api";
import { enumOf, type Schema } from "./schemaCheck";
import { HookEditor } from "./HookEditor";
import type { TerminalPreset } from "./terminalToml";

type Props = {
  draft: TerminalPreset;
  onChange: (p: TerminalPreset) => void;
  resolved: Resolved;
  schema: Schema | null;
  errors: Record<string, string>;
};

const get = (p: TerminalPreset, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      p,
    );

/** Immutable set; undefined/"" removes the key and prunes empty tables. */
function put(p: TerminalPreset, path: string, v: unknown): TerminalPreset {
  const [k, ...rest] = path.split(".");
  const cur = p as Record<string, unknown>;
  const next = { ...cur };
  const val = rest.length
    ? put((cur[k] ?? {}) as TerminalPreset, rest.join("."), v)
    : v;
  const empty =
    val === undefined ||
    val === "" ||
    (typeof val === "object" && Object.keys(val as object).length === 0);
  if (empty) delete next[k];
  else next[k] = val;
  return next as TerminalPreset;
}

const LAYER: Record<string, string> = { terminal: "preset", pane: "preset" };

export function TerminalForm({
  draft,
  onChange,
  resolved,
  schema,
  errors,
}: Props) {
  const set = (path: string, v: unknown) => onChange(put(draft, path, v));
  const inherited = (path: string) => {
    const r = resolved[path];
    return r && !LAYER[r.origin] ? r : undefined;
  };

  /** A field row: control, origin badge, reset-to-inherited. */
  const row = (
    label: string,
    path: string,
    control: (inh: unknown) => ReactElement<Record<string, unknown>>,
    hint?: string,
  ) => {
    const own = get(draft, path) !== undefined;
    const inh = inherited(path);
    const origin = own ? "preset" : (inh?.origin ?? "default");
    return (
      <div className="td-row" key={path}>
        <Field label={label} error={errors[path]} hint={hint}>
          {control(inh?.value)}
        </Field>
        <span className={`td-origin td-origin-${origin}`}>{origin}</span>
        {own && (
          <Button
            className="td-reset"
            aria-label={`Reset ${label} to inherited`}
            onClick={() => set(path, undefined)}
          >
            Reset
          </Button>
        )}
      </div>
    );
  };

  const text = (label: string, path: string) =>
    row(label, path, (inh) => (
      <Input
        value={(get(draft, path) as string | undefined) ?? ""}
        placeholder={inh === undefined ? undefined : String(inh)}
        onChange={(e) => set(path, e.target.value)}
      />
    ));
  const choice = (label: string, path: string) =>
    row(label, path, () => (
      <Select
        value={(get(draft, path) as string | undefined) ?? ""}
        onChange={(e) => set(path, e.target.value)}
      >
        <option value="">Inherited</option>
        {enumOf(schema, path).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    ));
  const number = (label: string, path: string) =>
    row(label, path, (inh) => (
      <Input
        type="number"
        value={(get(draft, path) as number | undefined) ?? ""}
        placeholder={inh === undefined ? undefined : String(inh)}
        onChange={(e) =>
          set(path, e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    ));

  const env = draft.env ?? [];
  const setEnv = (rows: typeof env) => onChange({ ...draft, env: rows });

  return (
    <form className="td-form" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>Basics</legend>
        {row("Name", "name", () => (
          <Input
            value={draft.name ?? ""}
            onChange={(e) => set("name", e.target.value)}
          />
        ))}
        {choice("Target", "target")}
        {text("Working directory", "cwd")}
        {row("Keep running", "persistent", (inh) => (
          <Switch
            checked={
              (draft.persistent ?? (inh as boolean | undefined)) === true
            }
            onCheckedChange={(v) => set("persistent", v)}
          />
        ))}
      </fieldset>
      <fieldset>
        <legend>Startup</legend>
        <div className="td-env">
          {env.map((r, i) => (
            <div className="td-env-row" key={i}>
              <Input
                aria-label={`Variable ${i + 1} name`}
                value={r.key}
                onChange={(e) =>
                  setEnv(
                    env.map((x, j) =>
                      j === i ? { ...x, key: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                aria-label={`Variable ${i + 1} value`}
                value={r.value}
                onChange={(e) =>
                  setEnv(
                    env.map((x, j) =>
                      j === i ? { ...x, value: e.target.value } : x,
                    ),
                  )
                }
              />
              <Button
                aria-label={`Remove variable ${i + 1}`}
                onClick={() => setEnv(env.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button onClick={() => setEnv([...env, { key: "", value: "" }])}>
            Add variable
          </Button>
        </div>
        <HookEditor
          label="Before start"
          hook={draft.pre_exec}
          error={errors.pre_exec}
          onChange={(h) => set("pre_exec", h)}
        />
        {text("Command", "command")}
        <HookEditor
          label="After command"
          hook={draft.post_exec}
          error={errors.post_exec}
          onChange={(h) => set("post_exec", h)}
        />
        <HookEditor
          label="On close"
          hook={draft.on_close}
          error={errors.on_close}
          onChange={(h) => set("on_close", h)}
        />
      </fieldset>
      <fieldset>
        <legend>Look</legend>
        {text("Theme", "theme")}
        {text("Font family", "font.family")}
        {number("Font size", "font.size")}
        {choice("Background", "background.kind")}
        {row("Opacity", "background.opacity", (inh) => (
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={
              (get(draft, "background.opacity") as number | undefined) ??
              (inh as number | undefined) ??
              1
            }
            onValueChange={(v) => set("background.opacity", v)}
          />
        ))}
      </fieldset>
    </form>
  );
}
