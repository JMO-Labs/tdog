import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { SegmentedControl } from "../components/ui/segmented";
import { Textarea } from "../components/ui/textarea";
import {
  deletePreset,
  getPresetToml,
  getSchema,
  listPresets,
  putPresetToml,
  resolveDraft,
  type Resolved,
} from "../presets/api";
import { TerminalForm } from "./TerminalForm";
import { TerminalPreview } from "./TerminalPreview";
import { checkTerminal, splitError, type Schema } from "./schemaCheck";
import {
  parseTerminal,
  serializeTerminal,
  type TerminalPreset,
} from "./terminalToml";

const NEW = "\0new";
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+|-+$/g, "")
    .slice(0, 64);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Props = {
  onDirty: (dirty: boolean) => void;
  /** Open a saved terminal preset as a real pane in the workspace. */
  onTry?: (preset: string) => void;
};

/** Terminal preset designer: pick, create, duplicate, edit and delete. */
export function TerminalDesigner({ onDirty, onTry }: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState<TerminalPreset>({});
  const [base, setBase] = useState("");
  const [resolved, setResolved] = useState<Resolved>({});
  const [schema, setSchema] = useState<Schema | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"form" | "toml">("form");
  // Raw editor text while it differs from the draft's canonical TOML.
  const [raw, setRaw] = useState<string | null>(null);
  const seq = useRef(0);

  const toml = useMemo(() => serializeTerminal(draft), [draft]);
  const parseError = useMemo(() => {
    if (raw === null) return "";
    try {
      parseTerminal(raw);
      return "";
    } catch (e) {
      return msg(e);
    }
  }, [raw]);
  const text = raw ?? toml;
  const edit = (p: TerminalPreset) => {
    setRaw(null);
    setDraft(p);
  };
  const editText = (v: string) => {
    setRaw(v);
    try {
      setDraft(parseTerminal(v));
    } catch {
      /* keep the last valid draft; the error shows inline */
    }
  };
  const dirty = toml.trim() !== base.trim();
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const open = useCallback(async (name: string) => {
    try {
      const p = parseTerminal(await getPresetToml("terminal", name));
      setCurrent(name);
      setDraft(p);
      setRaw(null);
      setBase(serializeTerminal(p));
      setErrors({});
      setStatus("");
      setConfirmDel(false);
    } catch (e) {
      setStatus(`Could not open ${name}: ${msg(e)}`);
    }
  }, []);

  useEffect(() => {
    let live = true;
    getSchema("terminal")
      .then((s) => live && setSchema(s))
      .catch(() => {});
    listPresets("terminal")
      .then((l) => {
        if (!live) return;
        setNames(l);
        if (l[0]) void open(l[0]);
        else startNew({});
      })
      .catch((e) => live && setStatus(msg(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Origins: the draft rides on top of global as the "pane" layer.
  useEffect(() => {
    const n = ++seq.current;
    resolveDraft(toml)
      .then((r) => n === seq.current && setResolved(r))
      .catch(() => n === seq.current && setResolved({}));
  }, [toml]);

  const leave = () => !dirty || confirm("Discard unsaved changes?");
  const startNew = (p: TerminalPreset) => {
    setCurrent(NEW);
    setDraft(p);
    setRaw(null);
    setBase("");
    setErrors({});
    setStatus("");
    setConfirmDel(false);
  };
  const pick = (name: string) => {
    if (name !== current && leave()) void open(name);
  };

  const save = async (): Promise<string | null> => {
    if (parseError) {
      setStatus("Fix the TOML errors first");
      return null;
    }
    const local = checkTerminal(schema, draft);
    const isNew = current === NEW;
    const slug = isNew ? slugify(draft.name ?? "") : (current ?? "");
    if (isNew && !slug) local.name = "Give the preset a name";
    setErrors(local);
    setStatus("");
    if (Object.keys(local).length) return null;
    setBusy(true);
    try {
      await putPresetToml("terminal", slug, toml);
      setBase(toml);
      setCurrent(slug);
      setNames((l) => (l.includes(slug) ? l : [...l, slug].sort()));
      setStatus("Saved");
      return slug;
    } catch (e) {
      const { path, message } = splitError(msg(e));
      if (path) setErrors({ [path]: message });
      else setStatus(message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const tryIt = async () => {
    const slug = dirty || current === NEW ? await save() : current;
    if (slug) onTry?.(slug);
  };

  const remove = async () => {
    if (current === NEW || current === null) return;
    try {
      await deletePreset("terminal", current);
      const rest = names.filter((n) => n !== current);
      setNames(rest);
      setBase(toml); // deleted: nothing left to guard
      if (rest[0]) await open(rest[0]);
      else startNew({});
    } catch (e) {
      setStatus(msg(e));
    }
  };

  const options = [
    ...names.map((n) => ({ value: n, label: n })),
    ...(current === NEW ? [{ value: NEW, label: "New preset" }] : []),
  ];

  return (
    <section className="td" aria-label="Terminal design">
      <div className="td-bar">
        <SegmentedControl
          aria-label="Terminal presets"
          options={options}
          value={current ?? ""}
          onValueChange={pick}
        />
        <Button onClick={() => leave() && startNew({})}>New</Button>
        <Button
          onClick={() =>
            leave() &&
            startNew({ ...draft, name: `${draft.name || current || ""} copy` })
          }
        >
          Duplicate
        </Button>
        {current !== NEW &&
          (confirmDel ? (
            <Button onClick={remove}>Confirm delete</Button>
          ) : (
            <Button onClick={() => setConfirmDel(true)}>Delete</Button>
          ))}
      </div>
      <SegmentedControl
        aria-label="Editor view"
        options={[
          { value: "form", label: "Form" },
          { value: "toml", label: "TOML" },
        ]}
        value={mode}
        onValueChange={(v) => setMode(v as "form" | "toml")}
      />
      <div className="td-split">
        <div className="td-edit">
          {mode === "form" ? (
            <TerminalForm
              draft={draft}
              onChange={edit}
              resolved={resolved}
              schema={schema}
              errors={errors}
            />
          ) : (
            <>
              <Textarea
                aria-label="Preset TOML"
                aria-invalid={parseError ? true : undefined}
                className="td-toml"
                spellCheck={false}
                value={text}
                onChange={(e) => editText(e.target.value)}
              />
              {parseError && (
                <p role="alert" className="td-toml-err">
                  {parseError}
                </p>
              )}
            </>
          )}
        </div>
        <TerminalPreview draft={draft} resolved={resolved} />
      </div>
      <div className="td-foot">
        <Button onClick={() => void save()} disabled={busy || !dirty}>
          Save
        </Button>
        {onTry && (
          <Button onClick={() => void tryIt()} disabled={busy}>
            Try it
          </Button>
        )}
        <span role="status" className="muted">
          {status}
        </span>
      </div>
    </section>
  );
}
