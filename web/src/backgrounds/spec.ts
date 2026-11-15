import type { CSSProperties } from "react";
import type { Resolved } from "../presets/api";
import { STARTER_PATTERNS, isAnimated } from "./starters";
import "./backgrounds.css";

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
  } else if (s.kind === "pattern" && s.ref in STARTER_PATTERNS) {
    paint = {
      background: STARTER_PATTERNS[s.ref],
      ...(isAnimated(s.ref)
        ? { animation: "tdog-bg-drift 6s linear infinite" }
        : {}),
    };
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
