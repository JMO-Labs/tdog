import { useCallback, useEffect, useState, type DragEvent } from "react";
import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { loadServerFonts } from "../theme/serverFonts";
import {
  applyFontToPreset,
  getPresetLigatures,
  installFont,
  listFonts,
  listTerminalPresets,
  searchCatalog,
  uploadFont,
  type FontPatch,
  type Installed,
} from "./fontsApi";

const SAMPLE =
  "const f = (a, b) => a !== b && a >= 0; // -> :: ===\n     git main ✓";
const EXT = /\.(ttf|otf|woff2)$/i;
type Tab = "installed" | "browse" | "upload";
const TABS: [Tab, string][] = [
  ["installed", "Installed"],
  ["browse", "Browse"],
  ["upload", "Upload"],
];
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Studio Fonts: installed fonts, browse + install, upload, apply to presets. */
export function FontsSection() {
  const [tab, setTab] = useState<Tab>("installed");
  const [fonts, setFonts] = useState<Installed[]>([]);
  const [presets, setPresets] = useState<string[]>([]);
  const [sample, setSample] = useState("");
  const [target, setTarget] = useState("default");
  const [ligatures, setLigatures] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setFonts(await listFonts());
    } catch (e) {
      setError(msg(e));
    }
  }, []);
  useEffect(() => {
    void loadServerFonts();
    void refresh();
    listTerminalPresets().then(setPresets, () => setPresets([]));
  }, [refresh]);
  useEffect(() => {
    let live = true;
    getPresetLigatures(target).then(
      (v) => live && setLigatures(v),
      () => live && setLigatures(true),
    );
    return () => {
      live = false;
    };
  }, [target]);

  const run = async (doing: string, done: string, fn: () => Promise<void>) => {
    setError("");
    setStatus(doing);
    try {
      await fn();
      setStatus(done);
    } catch (e) {
      setStatus("");
      setError(msg(e));
    }
  };
  const apply = (patch: FontPatch, done: string) =>
    run("Saving…", done, () => applyFontToPreset(target, patch));

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const bad = list.find((f) => !EXT.test(f.name));
    if (bad || !list.length) {
      setStatus("");
      setError(
        `${bad?.name ?? "That"} is not a font. Use .ttf, .otf or .woff2 files.`,
      );
      return;
    }
    for (const f of list) {
      await run(`Uploading ${f.name}…`, `Uploaded ${f.name}.`, () =>
        uploadFont(f),
      );
    }
    await refresh();
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void upload(e.dataTransfer.files);
  };

  const names = new Set(["default", ...presets]);
  return (
    <section className="fonts" aria-label="Fonts">
      <h3>Fonts</h3>
      <div role="tablist" className="fonts-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="fonts-tab"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="fonts-apply">
        <Field label="Apply to" hint="Default, or one terminal preset">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {[...names].map((n) => (
              <option key={n} value={n}>
                {n === "default" ? "Default" : n}
              </option>
            ))}
          </Select>
        </Field>
        <label className="fonts-lig">
          <Switch
            aria-label="Ligatures"
            checked={ligatures}
            onCheckedChange={(v) => {
              setLigatures(v);
              void apply(
                { ligatures: v },
                `Ligatures ${v ? "on" : "off"} for ${target}.`,
              );
            }}
          />
          Ligatures
        </label>
      </div>
      <p className="fonts-status" role="status">
        {status}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {tab === "installed" && (
        <>
          <Field
            label="Sample text"
            hint="Leave empty for the built-in code sample"
          >
            <Input value={sample} onChange={(e) => setSample(e.target.value)} />
          </Field>
          {fonts.length === 0 && (
            <p className="muted">
              No fonts installed yet. Try Browse or Upload.
            </p>
          )}
          <ul className="fonts-list">
            {fonts.map((f) => (
              <li key={f.family} className="fonts-item">
                <div className="fonts-row">
                  <strong>{f.family}</strong>
                  <span className="muted">{f.source}</span>
                  <Button
                    size="sm"
                    aria-label={`Use ${f.family}`}
                    onClick={() =>
                      void apply(
                        { family: f.family },
                        `${f.family} set for ${target}.`,
                      )
                    }
                  >
                    Use
                  </Button>
                </div>
                <pre
                  data-testid={`sample-${f.family}`}
                  className="fonts-sample"
                  style={{
                    fontFamily: `"${f.family}", monospace`,
                    fontVariantLigatures: ligatures ? "normal" : "none",
                  }}
                >
                  {sample || SAMPLE}
                </pre>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "browse" && (
        <>
          <Field label="Search fonts">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <ul className="fonts-list">
            {searchCatalog(query).map((f) => (
              <li key={`${f.source}/${f.name}`} className="fonts-row">
                <strong>{f.name}</strong>
                <span className="muted">
                  {f.source === "nerd" ? "Nerd Font" : "Google Fonts"}
                </span>
                <Button
                  size="sm"
                  aria-label={`Install ${f.name} (${f.source})`}
                  onClick={() =>
                    void run(
                      `Installing ${f.name}…`,
                      `Installed ${f.name}.`,
                      async () => {
                        await installFont(f.source, f.name);
                        await refresh();
                      },
                    )
                  }
                >
                  Install
                </Button>
              </li>
            ))}
          </ul>
          {searchCatalog(query).length === 0 && (
            <p className="muted">No fonts match “{query.trim()}”.</p>
          )}
        </>
      )}

      {tab === "upload" && (
        <div
          data-testid="dropzone"
          className="fonts-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <p>Drop .ttf, .otf or .woff2 files here</p>
          <label className="btn">
            Choose files
            <input
              type="file"
              hidden
              multiple
              accept=".ttf,.otf,.woff2"
              onChange={(e) => e.target.files && void upload(e.target.files)}
            />
          </label>
        </div>
      )}
    </section>
  );
}
