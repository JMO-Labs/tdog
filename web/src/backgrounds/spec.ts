import type { CSSProperties } from "react";
import type { Resolved } from "../presets/api";

export type BgKind = "color" | "gradient" | "pattern" | "image" | "video";
export interface BgSpec {
  kind: BgKind;
  ref: string;
  opacity: number;
  blur: number;
}

const KINDS: readonly string[] = [
  "color",
  "gradient",
  "pattern",
  "image",
  "video",
];

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);

/** Background layer from resolved preset fields; null when nothing is drawn. */
export function bgSpec(r: Resolved): BgSpec | null {
  const kind = r["background.kind"]?.value;
  if (typeof kind !== "string" || !KINDS.includes(kind)) return null;
  const ref = r["background.ref"]?.value;
  return {
    kind: kind as BgKind,
    ref: typeof ref === "string" ? ref : "",
    opacity: clamp(num(r["background.opacity"]?.value, 1), 0, 1),
    blur: clamp(num(r["background.blur"]?.value, 0), 0, 100),
  };
}

export const assetUrl = (id: string) => `/api/assets/${encodeURIComponent(id)}`;

const dot = (c: string) =>
  `radial-gradient(${c} 1.5px, transparent 1.5px) 0 0 / 14px 14px`;
const PATTERNS: Record<string, string> = {
  dots: dot("#8884"),
  grid: "linear-gradient(#8883 1px, transparent 1px) 0 0 / 16px 16px, linear-gradient(90deg, #8883 1px, transparent 1px) 0 0 / 16px 16px",
  stripes:
    "repeating-linear-gradient(45deg, #8882 0 6px, transparent 6px 12px)",
};
const SAFE_COLOR =
  /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|hsl)a?\([0-9\s.,%/-]+\))$/;
const SAFE_GRADIENT = /^(linear|radial)-gradient\([A-Za-z0-9#%.,\s()/+-]+\)$/;

/** CSS for non-video layers; null when the ref is unusable. Blur/opacity included. */
export function layerCss(s: BgSpec): CSSProperties | null {
  let paint: CSSProperties | null = null;
  if (s.kind === "color" && SAFE_COLOR.test(s.ref)) {
    paint = { background: s.ref };
  } else if (s.kind === "gradient" && SAFE_GRADIENT.test(s.ref)) {
    paint = { backgroundImage: s.ref };
  } else if (s.kind === "pattern" && s.ref in PATTERNS) {
    paint = { background: PATTERNS[s.ref] };
  } else if (s.kind === "image" && s.ref) {
    paint = {
      backgroundImage: `url("${assetUrl(s.ref)}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return paint && { ...paint, ...finish(s) };
}

/** Opacity and blur shared by every layer kind. */
export function finish(s: BgSpec): CSSProperties {
  return {
    opacity: s.opacity,
    ...(s.blur > 0 ? { filter: `blur(${s.blur}px)` } : {}),
  };
}

/** Animated layers (video, GIF) run only when seen and not in performance mode. */
export function shouldPlay(c: {
  pageVisible: boolean;
  onScreen: boolean;
  perf: boolean;
}): boolean {
  return c.pageVisible && c.onScreen && !c.perf;
}
