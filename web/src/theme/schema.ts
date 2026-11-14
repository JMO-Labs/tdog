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

export interface TerminalColors {
  fg: string;
  bg: string;
  cursor: string;
  selection: string;
  /** 8 normal + 8 bright. */
  ansi: string[];
}
export type Chrome = Partial<Record<ChromeToken, string>>;
export interface ThemeVariant {
  terminal: TerminalColors;
  chrome: Chrome;
}
export interface ThemeData extends ThemeVariant {
  name: string;
  description: string;
  appearance: "dark" | "light";
  pattern: Pattern;
  /** Suggested font family name; advisory only. */
  font?: string;
  /** Optional light variant, used when the light scheme is requested. */
  light?: ThemeVariant;
}

export type Result =
  { ok: true; theme: ThemeData } | { ok: false; error: string };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function unknownKeys(o: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(o).filter((k) => !allowed.includes(k));
}

function terminal(v: unknown, at: string): string | null {
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

function chrome(v: unknown, at: string): string | null {
  if (!isObj(v)) return `${at} must be an object`;
  const extra = unknownKeys(v, CHROME_TOKENS);
  if (extra.length) return `${at}: unknown token ${extra[0]}`;
  for (const [k, c] of Object.entries(v))
    if (!isHex(c)) return `${at}.${k} must be a hex color`;
  return null;
}

function variant(v: unknown, at: string, root = false): string | null {
  if (!isObj(v)) return `${at} must be an object`;
  if (!root) {
    const extra = unknownKeys(v, ["terminal", "chrome"]);
    if (extra.length) return `${at}: unknown key ${extra[0]}`;
  }
  return (
    terminal(v.terminal, `${at}.terminal`) ?? chrome(v.chrome, `${at}.chrome`)
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
    "pattern",
    "font",
    "light",
  ]);
  if (extra.length) return fail(`unknown key ${extra[0]}`);
  for (const k of ["name", "description"])
    if (typeof v[k] !== "string" || !v[k]) return fail(`${k} must be a string`);
  if (v.appearance !== "dark" && v.appearance !== "light")
    return fail("appearance must be dark or light");
  if (v.pattern !== "none" && !PATTERNS.includes(v.pattern as never))
    return fail("unknown pattern");
  if (v.font !== undefined && typeof v.font !== "string")
    return fail("font must be a string");
  const err =
    variant(v, "theme", true) ??
    (v.light === undefined ? null : variant(v.light, "light"));
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
