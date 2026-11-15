import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { SegmentedControl } from "../components/ui/segmented";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import { TEMPLATES, type TemplateId } from "../layout/templates";
import {
  getPresetToml,
  listPresets,
  putScenePreset,
  resolvePreset,
} from "../presets/api";
import { errorMessage } from "../presets/launch";
import { SceneCanvas } from "./SceneCanvas";
import {
  draftToToml,
  newDraft,
  parseDraft,
  resizeSlots,
  type Draft,
} from "./sceneModel";

const SWATCHES = ["", "#160b2e", "#223344", "#2d1b3d", "#12332b", "#3b2a14"];
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type Props = {
  /** Launch the saved scene in a new scene tab. */
  onOpenScene: (name: string) => Promise<void>;
};

/** Studio "Scene design": list, snap layout, canvas, sliders, TOML view. */
export function SceneDesigner({ onOpenScene }: Props) {
  const [scenes, setScenes] = useState<string[]>([]);
  const [presets, setPresets] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [looks, setLooks] = useState<Record<string, string>>({});
  const [view, setView] = useState<"form" | "toml">("form");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        listPresets("scene"),
        listPresets("terminal"),
      ]);
      setScenes(s);
      setPresets(t);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const wanted = Array.from(
    new Set(draft?.slots.map((s) => s.preset).filter(Boolean)),
  )
    .filter((p) => !(p in looks))
    .join(",");
  useEffect(() => {
    for (const p of wanted ? wanted.split(",") : []) {
      resolvePreset(p)
        .then((r) => String(r.theme?.value ?? "default"))
        .catch(() => "unavailable")
        .then((theme) => setLooks((l) => ({ ...l, [p]: theme })));
    }
  }, [wanted]);

  const edit = (patch: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const pickScene = async (name: string) => {
    setError("");
    setStatus("");
    setView("form");
    try {
      setDraft({ ...parseDraft(await getPresetToml("scene", name)), name });
    } catch (e) {
      setDraft(null);
      setError(errorMessage(e));
    }
  };
  const create = () => {
    setError("");
    setStatus("");
    setView("form");
    setDraft(newDraft(""));
  };
  const setTemplate = (t: TemplateId) =>
    draft && edit({ template: t, slots: resizeSlots(draft.slots, t) });

  const changeView = (v: string) => {
    if (!draft) return;
    if (v === "toml") {
      setSource(draftToToml(draft));
      setError("");
      setView("toml");
      return;
    }
    try {
      setDraft({ ...parseDraft(source), name: draft.name });
      setError("");
      setView("form");
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  /** Draft to save: the TOML text is the truth while that view is open. */
  const current = (): Draft | null => {
    if (!draft) return null;
    if (view === "form") return draft;
    try {
      return { ...parseDraft(source), name: draft.name };
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  };
  const save = async (): Promise<string | null> => {
    const d = current();
    if (!d) return null;
    if (!SLUG.test(d.name)) {
      setError("Name the scene with lowercase letters, digits, - or _.");
      return null;
    }
    try {
      await putScenePreset(d.name, draftToToml(d));
      setDraft(d);
      setError("");
      setStatus(`Saved "${d.name}".`);
      if (!scenes.includes(d.name)) setScenes([...scenes, d.name].sort());
      return d.name;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  };
  const open = async () => {
    const name = await save();
    if (name) await onOpenScene(name);
  };

  return (
    <div className="scene-designer">
      <aside className="scene-list" aria-label="Scenes">
        <Button onClick={create}>New scene</Button>
        {scenes.map((s) => (
          <button
            key={s}
            type="button"
            className="studio-nav-item"
            aria-current={draft?.name === s ? "true" : undefined}
            onClick={() => void pickScene(s)}
          >
            {s}
          </button>
        ))}
      </aside>
      <div className="scene-edit">
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {!draft ? (
          <p className="muted">Pick a scene or start a new one.</p>
        ) : (
          <>
            <div className="scene-bar">
              <Field label="Scene name">
                <Input
                  value={draft.name}
                  onChange={(e) => edit({ name: e.target.value })}
                />
              </Field>
              <label className="scene-switch">
                <Switch
                  aria-label="Start with server"
                  checked={draft.autostart}
                  onCheckedChange={(autostart) =>
                    view === "form"
                      ? edit({ autostart })
                      : setSource((s) =>
                          s.replace(
                            /^autostart = .*$/m,
                            `autostart = ${autostart}`,
                          ),
                        )
                  }
                />
                Start with server
              </label>
              <SegmentedControl
                aria-label="Editor view"
                value={view}
                onValueChange={changeView}
                options={[
                  { value: "form", label: "Form" },
                  { value: "toml", label: "TOML" },
                ]}
              />
            </div>
            {view === "toml" ? (
              <Textarea
                className="scene-toml"
                aria-label="Scene TOML"
                spellCheck={false}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            ) : (
              <Form
                draft={draft}
                presets={presets}
                looks={looks}
                edit={edit}
                setTemplate={setTemplate}
              />
            )}
            <div className="scene-actions">
              <Button onClick={() => void save()}>Save scene</Button>
              <Button onClick={() => void open()}>Open scene</Button>
              <span role="status" className="muted">
                {status}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type FormProps = {
  draft: Draft;
  presets: string[];
  looks: Record<string, string>;
  edit: (p: Partial<Draft>) => void;
  setTemplate: (t: TemplateId) => void;
};

function Form({ draft, presets, looks, edit, setTemplate }: FormProps) {
  return (
    <>
      <SegmentedControl
        aria-label="Snap layout"
        value={draft.template}
        onValueChange={(v) => setTemplate(v as TemplateId)}
        options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
      />
      <SceneCanvas
        draft={draft}
        presets={presets}
        looks={looks}
        onSlot={(i, patch) =>
          edit({
            slots: draft.slots.map((s, j) =>
              j === i ? { ...s, ...patch } : s,
            ),
          })
        }
      />
      <div className="scene-sliders">
        <Field label={`Main split ${Math.round(draft.ratio * 100)}%`}>
          <Slider
            aria-label="Main split"
            min={0.1}
            max={0.9}
            step={0.05}
            disabled={draft.template === "single"}
            value={draft.ratio}
            onValueChange={(ratio) => edit({ ratio })}
          />
        </Field>
        <Field label={`Gap between panes ${draft.gap}px`}>
          <Slider
            aria-label="Gap between panes"
            min={0}
            max={64}
            step={1}
            value={draft.gap}
            onValueChange={(gap) => edit({ gap })}
          />
        </Field>
        <Field label={`Pane opacity ${Math.round(draft.opacity * 100)}%`}>
          <Slider
            aria-label="Pane opacity"
            min={0}
            max={1}
            step={0.05}
            value={draft.opacity}
            onValueChange={(opacity) => edit({ opacity })}
          />
        </Field>
      </div>
      <div
        role="radiogroup"
        aria-label="Scene background"
        className="scene-swatches"
      >
        {SWATCHES.map((c) => (
          <button
            key={c || "none"}
            type="button"
            role="radio"
            aria-checked={draft.bg === c}
            aria-label={c ? `Background ${c}` : "No background"}
            className="scene-swatch"
            style={{ background: c || undefined }}
            onClick={() => edit({ bg: c })}
          />
        ))}
      </div>
    </>
  );
}
