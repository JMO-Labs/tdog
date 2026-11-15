import { useEffect, useMemo, useState } from "react";
import {
  getTerminalPreset,
  listPresets,
  putTerminalPreset,
} from "../presets/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { SegmentedControl } from "../components/ui/segmented";
import { fontFamily, loadFont } from "../theme/fonts";
import { THEMES, type Theme } from "../theme/registry";
import { themeStore } from "../theme/store";
import {
  filterThemes,
  pickRandom,
  setThemeInToml,
  type Appearance,
} from "./themes";

const inspiredBy = (t: Theme) =>
  /Inspired by [^.]*[.!]?/.exec(t.description)?.[0] ?? t.description;

/** Mini terminal in the theme's own colours, pattern and font. */
function Mini({ t }: { t: Theme }) {
  const { palette, font } = t.terminal;
  useEffect(() => void loadFont(font), [font]);
  const pattern = t.chrome.pattern;
  return (
    <div
      aria-hidden="true"
      className="theme-mini"
      style={{
        background: palette.bg,
        color: palette.fg,
        fontFamily: fontFamily(font),
      }}
    >
      {pattern !== "none" && (
        <i
          className="theme-mini-pat"
          style={{ backgroundImage: `var(--pat-${pattern}, none)` }}
        />
      )}
      <span style={{ color: palette.ansi[2] }}>$ </span>
      <span>tdog</span>
      <br />
      <span style={{ color: palette.ansi[4] }}>~/src</span>{" "}
      <span style={{ color: palette.ansi[1] }}>err</span>{" "}
      <span style={{ color: palette.ansi[3] }}>warn</span>
      <br />
      <span style={{ color: palette.ansi[2] }}>ok </span>
      <b style={{ background: palette.cursor }} className="theme-mini-cursor" />
    </div>
  );
}

/** Studio themes: browse, preview on hover/focus, and apply to a target. */
export function ThemeGallery() {
  const [query, setQuery] = useState("");
  const [appearance, setAppearance] = useState<Appearance>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [preset, setPreset] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    listPresets("terminal").then(
      (n) => live && setPresets(n),
      () => undefined,
    );
    return () => {
      live = false;
      themeStore.preview(null);
    };
  }, []);

  const shown = useMemo(
    () => filterThemes(THEMES, query, appearance),
    [query, appearance],
  );
  const pickedTheme = THEMES.find((t) => t.id === picked);

  const choose = (id: string) => {
    setPicked(id);
    setStatus(null);
  };
  const applyLocal = (label: string) => {
    if (!picked) return;
    themeStore.select(picked);
    setStatus({ ok: true, text: `${label}: ${pickedTheme?.name}.` });
  };
  const applyPreset = async () => {
    if (!picked || !preset) return;
    try {
      const toml = await getTerminalPreset(preset);
      await putTerminalPreset(preset, setThemeInToml(toml, picked));
      setStatus({ ok: true, text: `Saved to ${preset}.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    }
  };
  const randomize = () => {
    const t = pickRandom(shown, picked, Math.random);
    if (!t) return;
    choose(t.id);
    themeStore.preview(t.id);
  };

  return (
    <section className="themes" aria-label="Themes">
      <div className="themes-bar">
        <Input
          type="search"
          aria-label="Search themes"
          placeholder="Search themes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <SegmentedControl
          aria-label="Appearance"
          value={appearance}
          onValueChange={(v) => setAppearance(v as Appearance)}
          options={[
            { value: "all", label: "All" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
        <Button onClick={randomize}>Randomize</Button>
      </div>
      <div className="themes-apply" role="group" aria-label="Apply theme">
        <span className="muted">
          {pickedTheme
            ? `Apply ${pickedTheme.name} to`
            : "Pick a theme to apply"}
        </span>
        <Button
          disabled={!picked}
          onClick={() => applyLocal("This terminal now uses")}
        >
          This terminal
        </Button>
        <Button
          disabled={!picked}
          onClick={() => applyLocal("New terminals will start with")}
        >
          Default for new terminals
        </Button>
        <Select
          aria-label="Terminal preset"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          <option value="">Choose a terminal preset</option>
          {presets.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Button disabled={!picked || !preset} onClick={applyPreset}>
          Apply to preset
        </Button>
        <span
          role="status"
          className={status?.ok === false ? "themes-err" : "muted"}
        >
          {status?.text}
        </span>
      </div>
      {shown.length ? (
        <div className="themes-grid">
          {shown.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid="theme-card"
              className="theme-card"
              aria-pressed={t.id === picked}
              onClick={() => choose(t.id)}
              onMouseEnter={() => themeStore.preview(t.id)}
              onMouseLeave={() => themeStore.preview(null)}
              onFocus={() => themeStore.preview(t.id)}
              onBlur={() => themeStore.preview(null)}
              onKeyDown={(e) => e.key === "Escape" && themeStore.preview(null)}
            >
              <Mini t={t} />
              <strong>{t.name}</strong>
              <span className="muted">{inspiredBy(t)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="studio-none">No themes match “{query.trim()}”.</p>
      )}
    </section>
  );
}
