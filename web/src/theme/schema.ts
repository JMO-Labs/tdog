/** Data-only theme format (spec §8/§9). No JS, no raw CSS: hex colors and allowlisted ids only. */

export const CHROME_TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "fg",
  "muted",
  "line",
  "shadow",
  "link",
  "pink",
  "cyan",
  "yellow",
  "purple",
  "ink",
  "term-bg",
  "term-fg",
  "term-dim",
] as const;
export type ChromeToken = (typeof CHROME_TOKENS)[number];
export const PATTERNS = ["confetti", "zebra", "leopard", "zigzag"] as const;
export type Pattern = (typeof PATTERNS)[number] | "none";

export const FONTS = ["jetbrains-mono", "courier-prime"] as const;
export const EFFECTS = [
  "scanlines",
  "glow",
  "grain",
  "flicker",
  "vignette",
  "glyph-rain",
  "tracking",
] as const;
export const BOOTS = ["default"] as const;
export const COSTUMES = ["none"] as const;
export const SHADOWS = ["hard", "soft", "bevel", "glow", "none"] as const;
export const CURSOR_SHAPES = ["block", "bar", "underline"] as const;
export const MOTIF_SHAPES = ["path", "circle", "rect", "polygon"] as const;

export interface TerminalColors {
  fg: string;
  bg: string;
  cursor: string;
  selection: string;
  /** 8 normal + 8 bright. */
  ansi: string[];
}
export type Tokens = Partial<Record<ChromeToken, string>>;

/** A hex color or a chrome token name. */
export type Paint = string;
interface Paints {
  fill?: Paint;
  stroke?: Paint;
}
export type MotifShape = Paints &
  (
    | { type: "path"; d: string }
    | { type: "circle"; cx: number; cy: number; r: number }
    | { type: "rect"; x: number; y: number; width: number; height: number }
    | { type: "polygon"; points: string }
  );
/** Structured vector tile; the renderer builds the SVG (see motif.ts). */
export interface Motif {
  viewBox: [number, number, number, number];
  tile: [number, number];
  shapes: MotifShape[];
}
export interface Effect {
  id: (typeof EFFECTS)[number];
  intensity: number;
}
export interface TerminalScope {
  palette: TerminalColors;
  cursor: { shape: (typeof CURSOR_SHAPES)[number]; blink: boolean };
  font: (typeof FONTS)[number];
  effects: Effect[];
  motif?: Motif;
}
export interface ChromeScope {
  tokens: Tokens;
  shape: {
    radius: number;
    shadow: (typeof SHADOWS)[number];
    border: number;
  };
  pattern: Pattern;
  boot: (typeof BOOTS)[number];
  costume: (typeof COSTUMES)[number];
  motif?: Motif;
}
/** Light variant: colors only. */
export interface ThemeVariant {
  terminal: { palette: TerminalColors };
  chrome: { tokens: Tokens };
}
export interface ThemeData {
  name: string;
  description: string;
  appearance: "dark" | "light";
  /** Applies per pane. */
  terminal: TerminalScope;
  /** Applies page-wide, from the page theme only. */
  chrome: ChromeScope;
  light?: ThemeVariant;
}

export type Result =
  { ok: true; theme: ThemeData } | { ok: false; error: string };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const oneOf = (list: readonly string[], v: unknown) =>
  typeof v === "string" && list.includes(v);
const isPaint = (v: unknown) => isHex(v) || oneOf(CHROME_TOKENS, v);
/** Path data and point lists: digits, separators and command letters only. */
const GEOM = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/;

function unknownKeys(o: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(o).filter((k) => !allowed.includes(k));
}

function palette(v: unknown, at: string): string | null {
  if (!isObj(v)) return `${at} must be an object`;
  const extra = unknownKeys(v, ["fg", "bg", "cursor", "selection", "ansi"]);
  if (extra.length) return `${at}: unknown key ${extra[0]}`;
  for (const k of ["fg", "bg", "cursor", "selection"])
    if (!isHex(v[k])) return `${at}.${k} must be a hex color`;
  if (!Array.isArray(v.ansi) || v.ansi.length !== 16)
    return `${at}.ansi must have 16 colors`;
  if (!v.ansi.every(isHex)) return `${at}.ansi must be hex colors`;
  return null;
}

function tokens(v: unknown, at: string): string | null {
  if (!isObj(v)) return `${at} must be an object`;
  const extra = unknownKeys(v, CHROME_TOKENS);
  if (extra.length) return `${at}: unknown token ${extra[0]}`;
  for (const [k, c] of Object.entries(v))
    if (!isHex(c)) return `${at}.${k} must be a hex color`;
  return null;
}

const SHAPE_KEYS: Record<string, readonly string[]> = {
  path: ["d"],
  circle: ["cx", "cy", "r"],
  rect: ["x", "y", "width", "height"],
  polygon: ["points"],
};

function shape(v: unknown, at: string): string | null {
  if (!isObj(v)) return `${at} must be an object`;
  if (!oneOf(MOTIF_SHAPES, v.type)) return `${at}: unknown shape type`;
  const geo = SHAPE_KEYS[v.type as string];
  const extra = unknownKeys(v, ["type", "fill", "stroke", ...geo]);
  if (extra.length) return `${at}: unknown key ${extra[0]}`;
  for (const k of ["fill", "stroke"])
    if (v[k] !== undefined && !isPaint(v[k]))
      return `${at}.${k} must be a hex color or token name`;
  for (const k of geo) {
    const ok =
      k === "d" || k === "points"
        ? typeof v[k] === "string" && GEOM.test(v[k] as string)
        : isNum(v[k], -10000, 10000);
    if (!ok) return `${at}.${k} is invalid`;
  }
  return null;
}

function motif(v: unknown, at: string): string | null {
  if (!isObj(v)) return `${at} must be an object`;
  const extra = unknownKeys(v, ["viewBox", "tile", "shapes"]);
  if (extra.length) return `${at}: unknown key ${extra[0]}`;
  const nums = (a: unknown, n: number, lo: number) =>
    Array.isArray(a) && a.length === n && a.every((x) => isNum(x, lo, 10000));
  if (
    !nums(v.viewBox, 4, -10000) ||
    (v.viewBox as number[])[2] <= 0 ||
    (v.viewBox as number[])[3] <= 0
  )
    return `${at}.viewBox must be 4 numbers`;
  if (!nums(v.tile, 2, 1)) return `${at}.tile must be 2 positive numbers`;
  if (!Array.isArray(v.shapes) || v.shapes.length > 64)
    return `${at}.shapes must be a list of up to 64`;
  for (const [i, s] of v.shapes.entries()) {
    const e = shape(s, `${at}.shapes[${i}]`);
    if (e) return e;
  }
  return null;
}

function terminal(v: unknown, at: string): string | null {
  if (!isObj(v)) return `${at} must be an object`;
  const extra = unknownKeys(v, [
    "palette",
    "cursor",
    "font",
    "effects",
    "motif",
  ]);
  if (extra.length) return `${at}: unknown key ${extra[0]}`;
  const c = v.cursor;
  if (!isObj(c) || unknownKeys(c, ["shape", "blink"]).length)
    return `${at}.cursor must be {shape, blink}`;
  if (!oneOf(CURSOR_SHAPES, c.shape))
    return `${at}.cursor.shape is not allowed`;
  if (typeof c.blink !== "boolean") return `${at}.cursor.blink must be boolean`;
  if (!oneOf(FONTS, v.font)) return `${at}.font is not allowed`;
  if (!Array.isArray(v.effects) || v.effects.length > 8)
    return `${at}.effects must be a list`;
  for (const e of v.effects)
    if (
      !isObj(e) ||
      unknownKeys(e, ["id", "intensity"]).length ||
      !oneOf(EFFECTS, e.id) ||
      !isNum(e.intensity, 0, 1)
    )
      return `${at}.effects: invalid effect`;
  return (
    palette(v.palette, `${at}.palette`) ??
    (v.motif === undefined ? null : motif(v.motif, `${at}.motif`))
  );
}

function chrome(v: unknown, at: string): string | null {
  if (!isObj(v)) return `${at} must be an object`;
  const extra = unknownKeys(v, [
    "tokens",
    "shape",
    "pattern",
    "boot",
    "costume",
    "motif",
  ]);
  if (extra.length) return `${at}: unknown key ${extra[0]}`;
  const s = v.shape;
  if (!isObj(s) || unknownKeys(s, ["radius", "shadow", "border"]).length)
    return `${at}.shape must be {radius, shadow, border}`;
  if (!isNum(s.radius, 0, 1.5)) return `${at}.shape.radius must be 0..1.5`;
  if (!oneOf(SHADOWS, s.shadow)) return `${at}.shape.shadow is not allowed`;
  if (!isNum(s.border, 0, 3)) return `${at}.shape.border must be 0..3`;
  if (v.pattern !== "none" && !oneOf(PATTERNS, v.pattern))
    return `${at}.pattern is not allowed`;
  if (!oneOf(BOOTS, v.boot)) return `${at}.boot is not allowed`;
  if (!oneOf(COSTUMES, v.costume)) return `${at}.costume is not allowed`;
  return (
    tokens(v.tokens, `${at}.tokens`) ??
    (v.motif === undefined ? null : motif(v.motif, `${at}.motif`))
  );
}

function light(v: unknown): string | null {
  if (!isObj(v)) return "light must be an object";
  if (unknownKeys(v, ["terminal", "chrome"]).length)
    return "light: unknown key";
  const t = v.terminal;
  const c = v.chrome;
  if (!isObj(t) || unknownKeys(t, ["palette"]).length)
    return "light.terminal must be {palette}";
  if (!isObj(c) || unknownKeys(c, ["tokens"]).length)
    return "light.chrome must be {tokens}";
  return (
    palette(t.palette, "light.terminal.palette") ??
    tokens(c.tokens, "light.chrome.tokens")
  );
}

export function validateTheme(v: unknown): Result {
  const fail = (error: string): Result => ({ ok: false, error });
  if (!isObj(v)) return fail("theme must be an object");
  const extra = unknownKeys(v, [
    "name",
    "description",
    "appearance",
    "terminal",
    "chrome",
    "light",
  ]);
  if (extra.length) return fail(`unknown key ${extra[0]}`);
  for (const k of ["name", "description"])
    if (typeof v[k] !== "string" || !v[k]) return fail(`${k} must be a string`);
  if (v.appearance !== "dark" && v.appearance !== "light")
    return fail("appearance must be dark or light");
  const err =
    terminal(v.terminal, "terminal") ??
    chrome(v.chrome, "chrome") ??
    (v.light === undefined ? null : light(v.light));
  return err ? fail(err) : { ok: true, theme: v as unknown as ThemeData };
}

function lum(hex: string): number {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
