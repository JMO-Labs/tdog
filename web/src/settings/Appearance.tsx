import { useSyncExternalStore } from "react";
import { THEMES } from "../theme/registry";
import { themeStore } from "../theme/store";
import { MODES, useThemeMode, type ThemeMode } from "../theme/useThemeMode";

const LABEL: Record<ThemeMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Color mode segmented control and a theme grid with swatches and hover preview. */
export function Appearance() {
  const { mode, set } = useThemeMode();
  const active = useSyncExternalStore(themeStore.subscribe, () => {
    // select() clears any preview, so compare against the persisted choice.
    return localStorage.getItem("tdog.theme.id") ?? THEMES[0].id;
  });
  return (
    <>
      <div className="seg" role="radiogroup" aria-label="Color mode">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => set(m)}
          >
            {LABEL[m]}
          </button>
        ))}
      </div>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="theme-card"
            aria-pressed={active === t.id}
            title={t.description}
            onMouseEnter={() => themeStore.preview(t.id)}
            onMouseLeave={() => themeStore.preview(null)}
            onFocus={() => themeStore.preview(t.id)}
            onBlur={() => themeStore.preview(null)}
            onClick={() => themeStore.select(t.id)}
          >
            <span className="swatch" aria-hidden="true">
              {[
                t.terminal.bg,
                t.terminal.ansi[1],
                t.terminal.ansi[2],
                t.terminal.ansi[4],
                t.terminal.fg,
              ].map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
            <span className="theme-name">{t.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
