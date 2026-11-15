import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { SegmentedControl } from "../components/ui/segmented";
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

type Props = { onDirty: (dirty: boolean) => void };

/** Terminal preset designer: pick, create, duplicate, edit and delete. */
export function TerminalDesigner({ onDirty }: Props) {
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
  const seq = useRef(0);

  const toml = useMemo(() => serializeTerminal(draft), [draft]);
  const dirty = toml.trim() !== base.trim();
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const open = useCallback(async (name: string) => {
    try {
      const p = parseTerminal(await getPresetToml("terminal", name));
      setCurrent(name);
      setDraft(p);
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
    setBase("");
    setErrors({});
    setStatus("");
    setConfirmDel(false);
  };
  const pick = (name: string) => {
    if (name !== current && leave()) void open(name);
  };

  const save = async () => {
    const local = checkTerminal(schema, draft);
    const isNew = current === NEW;
    const slug = isNew ? slugify(draft.name ?? "") : (current ?? "");
    if (isNew && !slug) local.name = "Give the preset a name";
    setErrors(local);
    setStatus("");
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await putPresetToml("terminal", slug, toml);
      setBase(toml);
      setCurrent(slug);
      setNames((l) => (l.includes(slug) ? l : [...l, slug].sort()));
      setStatus("Saved");
    } catch (e) {
      const { path, message } = splitError(msg(e));
      if (path) setErrors({ [path]: message });
      else setStatus(message);
    } finally {
      setBusy(false);
    }
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
      <TerminalForm
        draft={draft}
        onChange={setDraft}
        resolved={resolved}
        schema={schema}
        errors={errors}
      />
      <div className="td-foot">
        <Button onClick={save} disabled={busy || !dirty}>
          Save
        </Button>
        <span role="status" className="muted">
          {status}
        </span>
      </div>
    </section>
  );
}
