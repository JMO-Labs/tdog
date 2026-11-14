import type { TerminalTheme } from "../terminal/renderer";
import { DEFAULT_THEME_ID, THEMES, findTheme, type Theme } from "./registry";
import type { TerminalColors, ThemeVariant } from "./schema";

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
    return findTheme(v) ? v! : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

let id = read();
let previewId: string | null = null;
let scheme: Scheme = "system";
let applied: string[] = [];
const listeners = new Set<() => void>();

const current = (): Theme => findTheme(previewId ?? id) ?? THEMES[0];

function variant(t: Theme): ThemeVariant {
  const light = scheme === "light" || (scheme === "system" && prefersLight());
  return light && t.light ? t.light : t;
}

function apply() {
  const t = current();
  const el = document.documentElement;
  applied.forEach((p) => el.style.removeProperty(p));
  applied = [];
  const set = (p: string, v: string) => {
    el.style.setProperty(p, v);
    applied.push(p);
  };
  for (const [k, v] of Object.entries(variant(t).chrome)) set(`--${k}`, v);
  if (t.pattern !== "confetti")
    set("--pattern", t.pattern === "none" ? "none" : `var(--pat-${t.pattern})`);
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
  terminal: (): TerminalTheme => toTerminalTheme(variant(current()).terminal),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  select(next: string) {
    if (!findTheme(next)) return;
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
    previewId = next && findTheme(next) ? next : null;
    apply();
  },
  setScheme(s: Scheme) {
    scheme = s;
    apply();
  },
  /** Re-read persisted state (tests). */
  reset() {
    id = read();
    previewId = null;
    scheme = "system";
    apply();
  },
};
