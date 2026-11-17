import type { MutableRefObject } from "react";
import type { TerminalRenderer, TerminalTheme } from "./renderer";
import {
  NATIVE_SPACING,
  SPACING,
  fontFamily,
  fontScale,
  loadFont,
  scaledSize,
} from "../theme/fonts";
import { whenFamilyReady } from "../theme/serverFonts";
import { themeStore } from "../theme/store";
import type { Resolved } from "../presets/api";

/** Clear the background when a motif or effect is painted behind the text. */
export function terminalPaint(t: TerminalTheme, clear: boolean): TerminalTheme {
  return clear ? { ...t, background: "rgba(0,0,0,0)" } : t;
}

const wantFamily = new WeakMap<TerminalRenderer, string | undefined>();
/** Theme-font size multiplier per renderer, so a later size-only change keeps it. */
const themeScale = new WeakMap<TerminalRenderer, number>();

export function applyFont(r: TerminalRenderer | null, f: Resolved) {
  const family = f["font.family"]?.value;
  const size = f["font.size"]?.value;
  const f2 = typeof family === "string" ? family : undefined;
  const raw = typeof size === "number" ? size : undefined;
  const s2 = raw && !f2 && r ? Math.round(raw * (themeScale.get(r) ?? 1)) : raw;
  const sp = f2 ? NATIVE_SPACING : undefined;
  if (f2 || s2) r?.setFont?.(f2, s2, sp);
  // Server-installed families arrive via /api/fonts.css; refit once loaded.
  if (r) wantFamily.set(r, f2);
  if (f2 && r)
    void whenFamilyReady(f2).then(() => {
      if (wantFamily.get(r) === f2) r.setFont?.(f2, s2, sp);
    });
}

/** Drop per-renderer font bookkeeping on dispose. */
export function forgetFont(r: TerminalRenderer) {
  wantFamily.delete(r);
}

/** Refs the theme scope reads; owned by the pane. */
export type ScopeRefs = {
  renderer: MutableRefObject<TerminalRenderer | null>;
  theme: MutableRefObject<string | undefined>;
  font: MutableRefObject<Resolved>;
  visible: MutableRefObject<boolean>;
  scopeFont: MutableRefObject<string | null>;
};

/** Cursor now; theme font once loaded, unless a preset sets the family. */
export function applyThemeScope(r: TerminalRenderer, refs: ScopeRefs) {
  const { cursor, font } = themeStore.scope(refs.theme.current);
  r.setCursor(cursor);
  const presetFont = () =>
    typeof refs.font.current["font.family"]?.value === "string";
  if (presetFont()) return;
  if (!refs.visible.current || refs.scopeFont.current === font) return;
  refs.scopeFont.current = font;
  void loadFont(font).then(() => {
    if (refs.renderer.current !== r || refs.scopeFont.current !== font) return;
    if (presetFont()) return;
    const size = refs.font.current["font.size"]?.value;
    themeScale.set(r, fontScale(font));
    r.setFont?.(
      fontFamily(font),
      scaledSize(font, typeof size === "number" ? size : undefined),
      SPACING,
    );
  });
}
