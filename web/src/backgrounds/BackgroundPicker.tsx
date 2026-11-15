import { useEffect, useState, type DragEvent } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { SegmentedControl } from "../components/ui/segmented";
import { Slider } from "../components/ui/slider";
import { Dialog } from "../overlays/Dialog";
import {
  assetFromUrl,
  deleteAsset,
  listAssets,
  uploadAsset,
  type Asset,
} from "./assetsApi";
import { GradientTab } from "./GradientTab";
import type { BgSpec } from "./spec";
import { assetUrl } from "./spec";
import { STARTERS, starterThumb } from "./starters";
import "./picker.css";

type Tab = "starters" | "uploads" | "gradient";
const TABS = [
  { value: "starters", label: "Starters" },
  { value: "uploads", label: "Uploads" },
  { value: "gradient", label: "Gradient" },
];
const GROUPS = ["Gradients", "Patterns", "Textures", "Animated"] as const;

type Props = { value: BgSpec; onChange: (v: BgSpec) => void };

/** Background picker for Look fields: starters, uploads, gradient + opacity/blur. */
export function BackgroundPicker({ value, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("starters");
  const set = (p: Partial<BgSpec>) => onChange({ ...value, ...p });
  return (
    <div className="bgp">
      <SegmentedControl
        aria-label="Background source"
        options={TABS}
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
      />
      {tab === "starters" && (
        <div className="bgp-starters">
          {GROUPS.map((g) => (
            <section key={g}>
              <h4>{g}</h4>
              <div className="bgp-grid">
                {STARTERS.filter((s) => s.group === g).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="bgp-tile"
                    aria-label={s.label}
                    aria-pressed={value.kind === s.kind && value.ref === s.ref}
                    onClick={() => set({ kind: s.kind, ref: s.ref })}
                  >
                    <span
                      className={`bgp-thumb${s.animated ? " bgp-anim" : ""}`}
                      style={starterThumb(s)}
                    />
                    <span className="bgp-name">{s.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {tab === "uploads" && <Uploads value={value} set={set} />}
      {tab === "gradient" && <GradientTab value={value} set={set} />}
      <label className="bgp-row">
        Opacity
        <Slider
          aria-label="Opacity"
          min={0}
          max={100}
          value={Math.round(value.opacity * 100)}
          onValueChange={(n) => set({ opacity: n / 100 })}
        />
      </label>
      <label className="bgp-row">
        Blur
        <Slider
          aria-label="Blur"
          min={0}
          max={40}
          value={value.blur}
          onValueChange={(n) => set({ blur: n })}
        />
      </label>
    </div>
  );
}

function Uploads({
  value,
  set,
}: {
  value: BgSpec;
  set: (p: Partial<BgSpec>) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [doomed, setDoomed] = useState<Asset | null>(null);

  useEffect(() => {
    listAssets().then(setAssets, (e: Error) => setError(e.message));
  }, []);

  const add = async (make: () => Promise<Asset>) => {
    setBusy(true);
    setError("");
    try {
      const a = await make();
      setAssets((l) => [a, ...l.filter((x) => x.id !== a.id)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    for (const f of Array.from(e.dataTransfer.files))
      void add(() => uploadAsset(f));
  };
  const remove = async () => {
    if (!doomed) return;
    const a = doomed;
    setDoomed(null);
    try {
      await deleteAsset(a.id);
      setAssets((l) => l.filter((x) => x.id !== a.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="bgp-uploads">
      <div
        data-testid="dropzone"
        className="bgp-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <p>Drop an image or video here</p>
        <label className="bgp-file">
          <span>or choose a file</span>
          <input
            type="file"
            accept="image/*,video/*"
            aria-label="Choose a file"
            onChange={(e) => {
              for (const f of Array.from(e.target.files ?? []))
                void add(() => uploadAsset(f));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <form
        className="bgp-url"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim())
            void add(() => assetFromUrl(url.trim())).then(() => setUrl(""));
        }}
      >
        <Input
          aria-label="Image URL"
          placeholder="Paste an image URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button type="submit" disabled={busy || !url.trim()}>
          Fetch
        </Button>
      </form>
      {error && (
        <p role="alert" className="bgp-error">
          {error}
        </p>
      )}
      {!assets.length && <p className="muted">No uploads yet.</p>}
      <div className="bgp-grid">
        {assets.map((a) => (
          <div key={a.id} className="bgp-tile bgp-upload">
            <button
              type="button"
              aria-label={`Use ${a.kind} ${a.id}`}
              aria-pressed={value.ref === a.id}
              onClick={() => set({ kind: a.kind, ref: a.id })}
            >
              {a.kind === "image" ? (
                <img src={assetUrl(a.id)} alt="" className="bgp-thumb" />
              ) : (
                <video src={assetUrl(a.id)} muted className="bgp-thumb" />
              )}
            </button>
            <Button
              aria-label={`Delete ${a.kind} ${a.id}`}
              onClick={() => setDoomed(a)}
            >
              Delete
            </Button>
          </div>
        ))}
      </div>
      <Dialog
        open={!!doomed}
        title="Delete this upload?"
        onClose={() => setDoomed(null)}
      >
        <p>Scenes and terminals that use it will fall back to no background.</p>
        <Button onClick={() => setDoomed(null)}>Cancel</Button>
        <Button onClick={() => void remove()}>Delete</Button>
      </Dialog>
    </div>
  );
}
