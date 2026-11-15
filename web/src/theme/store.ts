import type { TerminalTheme } from "../terminal/renderer";
import {
  DEFAULT_THEME_ID,
  PLAIN_THEME_ID,
  THEMES,
  findTheme as lookup,
  type Theme,
} from "./registry";
import { getPref, subscribePrefs } from "../settings/prefs";
import { motifSvg } from "./motif";
import {
  CHROME_TOKENS,
  type Effect,
  type TerminalColors,
  type ThemeVariant,
} from "./schema";

export type Scheme = "system" | "light" | "dark";
const KEY = "tdog.theme.id";
const NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export function toTerminalTheme(t: TerminalColors): TerminalTheme {
  const out: TerminalTheme = {
    foreground: t.fg,
    background: t.bg,
    cursor: t.cursor,
    selectionBackground: t.selection,
  };
  NAMES.forEach((n, i) => (out[n] = t.ansi[i]));
  return out;
}

const prefersLight = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-color-scheme: light)").matches;

function read(): string {
  try {
    const v = localStorage.getItem(KEY);
    return lookup(v) ? v! : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

let serious = getPref("serious");
/** Serious mode swaps every theme lookup for Plain; stored choices stay untouched. */
const findTheme = (tid: string | null | undefined) =>
  lookup(serious ? PLAIN_THEME_ID : tid);

let id = read();
let previewId: string | null = null;
let panePreview: { pane: string; theme: string } | null = null;
let scheme: Scheme = "system";
let applied: string[] = [];
const listeners = new Set<() => void>();

const current = (): Theme => findTheme(previewId ?? id) ?? THEMES[0];

function variant(t: Theme): ThemeVariant {
  const light = scheme === "light" || (scheme === "system" && prefersLight());
  // `light` holds the alternate-appearance variant: the base serves its own appearance.
  return (light ? "light" : "dark") === t.appearance ? t : (t.light ?? t);
}

/** Theme tokens merged over computed CSS defaults, so unset tokens still resolve. */
function resolveTokens(tokens: Record<string, string>): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const resolved: Record<string, string> = {};
  for (const k of CHROME_TOKENS) {
    const v = tokens[k] ?? cs.getPropertyValue(`--${k}`).trim();
    if (v) resolved[k] = v;
  }
  return resolved;
}

const NAMED_COLORS = ["pink", "cyan", "yellow", "purple"] as const;

/** Accent for a theme: its chrome.accent, else the pink token. */
export function themeAccent(t: Theme): string {
  return t.chrome.accent ?? t.chrome.tokens.pink ?? "";
}

/** Readable text on an accent: white or near-black by relative luminance. */
function inkFor(hex: string): string {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111" : "#fff";
}

function apply() {
  const t = current();
  const el = document.documentElement;
  if (serious) el.dataset.serious = "1";
  else delete el.dataset.serious;
  applied.forEach((p) => el.style.removeProperty(p));
  applied = [];
  const set = (p: string, v: string) => {
    el.style.setProperty(p, v);
    applied.push(p);
  };
  const tokens = variant(t).chrome.tokens;
  const { pattern, motif, tint, tintPct } = t.chrome;
  const accent = themeAccent(t);
  if (accent) {
    set("--accent", accent);
    set("--accent-ink", inkFor(accent));
  }
  if (tint) {
    set("--tint", tint);
    set("--tint-pct", `${Math.min(5, Math.max(0, tintPct ?? 0))}%`);
  }
  for (const k of NAMED_COLORS) if (tokens[k]) set(`--${k}`, tokens[k]!);
  for (const [k, v] of Object.entries(tokens))
    if (k.startsWith("term-")) set(`--${k}`, v);
  if (pattern !== "confetti")
    set("--pattern", pattern === "none" ? "none" : `var(--pat-${pattern})`);
  // Auth backdrop and empty panes read --pattern: the motif replaces confetti there.
  if (motif)
    set("--pattern", `url("${motifSvg(motif, resolveTokens(tokens))}")`);
  // A theme with a light variant follows the scheme; others pin their appearance.
  if (t.light) {
    if (scheme === "system") el.removeAttribute("data-theme");
    else el.dataset.theme = scheme;
  } else {
    el.dataset.theme = t.appearance;
  }
  listeners.forEach((l) => l());
}

export const themeStore = {
  get: current,
  /** Renderer colors for the active theme and scheme. */
  terminal: (themeId?: string | null): TerminalTheme =>
    toTerminalTheme(
      variant((themeId ? findTheme(themeId) : undefined) ?? current()).terminal
        .palette,
    ),
  /** Cursor and font id for a pane's theme (defaults to the page theme). */
  scope(themeId?: string | null) {
    const { cursor, font } = (
      (themeId ? findTheme(themeId) : undefined) ?? current()
    ).terminal;
    return { cursor, font };
  },
  /** Screen effects declared by a terminal theme (data only). */
  effects: (themeId?: string | null): Effect[] =>
    ((themeId ? findTheme(themeId) : undefined) ?? current()).terminal.effects,
  /** Terminal motif as a CSS url() for a pane's theme, or null when it has none. */
  terminalMotif: (themeId?: string | null): string | null => {
    const t = (themeId ? findTheme(themeId) : undefined) ?? current();
    const m = t.terminal.motif;
    if (!m) return null;
    const tokens = variant(t).chrome.tokens as Record<string, string>;
    return `url("${motifSvg(m, resolveTokens(tokens))}")`;
  },
  /** Page-chrome backdrop for a theme card: its motif url, else its pattern. */
  backdrop(themeId: string): string {
    const t = findTheme(themeId);
    if (!t) return "none";
    const { pattern, motif } = t.chrome;
    if (motif)
      return `url("${motifSvg(motif, resolveTokens(variant(t).chrome.tokens))}")`;
    return pattern === "none" ? "none" : `var(--pat-${pattern})`;
  },
  /** Theme id a pane should show: its previewed theme, else `fallback`. */
  paneTheme: (pane: string | undefined, fallback: string | undefined) =>
    panePreview && panePreview.pane === pane ? panePreview.theme : fallback,
  /** Preview a terminal theme on one pane only; page chrome is untouched. */
  previewPane(pane: string | null, themeId: string | null) {
    panePreview =
      pane && themeId && findTheme(themeId) ? { pane, theme: themeId } : null;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  select(next: string) {
    if (!lookup(next)) return;
    id = next;
    previewId = null;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage unavailable: applies for this session only
    }
    apply();
  },
  /** Live preview without persisting; null reverts. */
  preview(next: string | null) {
    previewId = next && lookup(next) ? next : null;
    apply();
  },
  setScheme(s: Scheme) {
    scheme = s;
    apply();
  },
  /** Re-read persisted state (tests). */
  reset() {
    serious = getPref("serious");
    id = read();
    previewId = null;
    panePreview = null;
    scheme = "system";
    watchScheme();
    apply();
  },
};

// System scheme follows the OS live; explicit light/dark ignore it.
const watched = new WeakSet<object>();
function watchScheme() {
  if (typeof matchMedia !== "function") return;
  const mq = matchMedia("(prefers-color-scheme: light)");
  if (!mq || watched.has(mq)) return;
  watched.add(mq);
  mq.addEventListener?.("change", () => {
    if (scheme === "system") apply();
  });
}
watchScheme();

// Serious mode flips live: re-apply whenever the pref changes.
subscribePrefs(() => {
  const next = getPref("serious");
  if (next === serious) return;
  serious = next;
  apply();
});
