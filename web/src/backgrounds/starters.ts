import type { CSSProperties } from "react";
import type { BgKind } from "./spec";

/** Original starter backgrounds: pure CSS, nothing third-party. */
export interface Starter {
  id: string;
  label: string;
  group: "Gradients" | "Patterns" | "Textures" | "Animated";
  kind: Extract<BgKind, "gradient" | "pattern">;
  /** Gradient CSS, or the pattern id. */
  ref: string;
  animated?: boolean;
}

const g = (id: string, label: string, ref: string): Starter => ({
  id,
  label,
  group: "Gradients",
  kind: "gradient",
  ref,
});
const p = (
  group: Starter["group"],
  id: string,
  label: string,
  animated = false,
): Starter => ({
  id,
  label,
  group,
  kind: "pattern",
  ref: id,
  ...(animated ? { animated } : {}),
});

export const STARTERS: Starter[] = [
  g(
    "sunset",
    "Sunset",
    "linear-gradient(160deg, #ff7a59 0%, #c2185b 55%, #2b1055 100%)",
  ),
  g("ocean", "Ocean", "linear-gradient(180deg, #0f4c81 0%, #0a1f3d 100%)"),
  g("forest", "Forest", "linear-gradient(165deg, #1f6f4a 0%, #0b2a1d 100%)"),
  g(
    "ember",
    "Ember",
    "linear-gradient(200deg, #ffb347 0%, #d1360b 50%, #1a0500 100%)",
  ),
  g(
    "aurora",
    "Aurora",
    "linear-gradient(120deg, #00e5a8 0%, #3b5bdb 50%, #7c2ae8 100%)",
  ),
  g(
    "midnight",
    "Midnight",
    "linear-gradient(180deg, #141432 0%, #05050f 100%)",
  ),
  g("peach", "Peach", "linear-gradient(135deg, #ffd1a9 0%, #ff8fa3 100%)"),
  g("mint", "Mint", "linear-gradient(135deg, #c8ffe0 0%, #3ac1a0 100%)"),
  g(
    "dusk",
    "Dusk",
    "linear-gradient(0deg, #ff9966 0%, #5b3b8c 60%, #15103a 100%)",
  ),
  g(
    "graphite",
    "Graphite",
    "linear-gradient(145deg, #3a3f47 0%, #14161a 100%)",
  ),
  g(
    "spotlight",
    "Spotlight",
    "radial-gradient(circle at 50% 30%, #3d4a6b 0%, #0b0d14 70%)",
  ),
  g(
    "vignette",
    "Vignette",
    "radial-gradient(circle at 50% 50%, #1d2b2b 0%, #050808 100%)",
  ),
  g(
    "neon-pink",
    "Neon pink",
    "radial-gradient(circle at 80% 20%, #ff2fa0 0%, #1a0626 65%)",
  ),
  p("Patterns", "dots", "Dots"),
  p("Patterns", "grid", "Grid"),
  p("Patterns", "stripes", "Stripes"),
  p("Patterns", "checks", "Checks"),
  p("Patterns", "diagonal", "Diagonal"),
  p("Patterns", "crosshatch", "Crosshatch"),
  p("Patterns", "graph", "Graph paper"),
  p("Patterns", "plus", "Plus signs"),
  p("Patterns", "zigzag", "Zigzag"),
  p("Patterns", "waves", "Waves"),
  p("Textures", "scanlines", "Scanlines"),
  p("Textures", "noise", "Grain"),
  p("Textures", "weave", "Weave"),
  p("Textures", "paper", "Paper"),
  p("Textures", "carbon", "Carbon"),
  p("Textures", "halftone", "Halftone"),
  p("Animated", "drift-dots", "Drifting dots", true),
  p("Animated", "drift-grid", "Drifting grid", true),
  p("Animated", "drift-stripes", "Drifting stripes", true),
  p("Animated", "drift-checks", "Drifting checks", true),
];

const dot = (c: string, r = "1.5px", s = "14px") =>
  `radial-gradient(${c} ${r}, transparent ${r}) 0 0 / ${s} ${s}`;
const checks = (c: string, s: string) =>
  `conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0) 0 0 / ${s} ${s}`;

export const STARTER_PATTERNS: Record<string, string> = {
  dots: dot("#8884"),
  grid: "linear-gradient(#8883 1px, transparent 1px) 0 0 / 16px 16px, linear-gradient(90deg, #8883 1px, transparent 1px) 0 0 / 16px 16px",
  stripes:
    "repeating-linear-gradient(45deg, #8882 0 6px, transparent 6px 12px)",
  checks: checks("#8882", "24px"),
  diagonal:
    "repeating-linear-gradient(-45deg, #8883 0 1px, transparent 1px 10px)",
  crosshatch:
    "repeating-linear-gradient(45deg, #8872 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, #8872 0 1px, transparent 1px 9px)",
  graph:
    "linear-gradient(#8885 1px, transparent 1px) 0 0 / 64px 64px, linear-gradient(90deg, #8885 1px, transparent 1px) 0 0 / 64px 64px, linear-gradient(#8832 1px, transparent 1px) 0 0 / 8px 8px, linear-gradient(90deg, #8832 1px, transparent 1px) 0 0 / 8px 8px",
  plus: "linear-gradient(#8885, #8885) 50% 0 / 1px 100% no-repeat, linear-gradient(90deg, #8885, #8885) 0 50% / 100% 1px no-repeat",
  zigzag:
    "linear-gradient(135deg, #8883 25%, transparent 25%) -10px 0 / 20px 20px, linear-gradient(225deg, #8883 25%, transparent 25%) -10px 0 / 20px 20px",
  waves:
    "radial-gradient(circle at 50% 100%, transparent 8px, #8883 9px, #8883 10px, transparent 11px) 0 0 / 24px 12px",
  scanlines:
    "repeating-linear-gradient(0deg, #0006 0 1px, transparent 1px 3px)",
  noise:
    "repeating-conic-gradient(#8881 0 25%, #0001 0 50%) 0 0 / 3px 3px, repeating-linear-gradient(37deg, #8881 0 1px, transparent 1px 4px)",
  weave:
    "repeating-linear-gradient(0deg, #8882 0 2px, transparent 2px 4px), repeating-linear-gradient(90deg, #0003 0 2px, transparent 2px 4px)",
  paper:
    "repeating-linear-gradient(90deg, #fff1 0 1px, transparent 1px 7px), repeating-linear-gradient(0deg, #0001 0 1px, transparent 1px 5px)",
  carbon: `${checks("#0004", "8px")}, ${checks("#fff1", "8px").replace("0 0 /", "4px 4px /")}`,
  halftone: dot("#8886", "2px", "8px"),
  "drift-dots": dot("#8885", "2px", "24px"),
  "drift-grid":
    "linear-gradient(#8884 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, #8884 1px, transparent 1px) 0 0 / 24px 24px",
  "drift-stripes":
    "repeating-linear-gradient(45deg, #8883 0 8px, transparent 8px 16px)",
  "drift-checks": checks("#8883", "24px"),
};

export const isAnimated = (ref: string) => ref.startsWith("drift-");

/** Static swatch style for a starter's picker thumbnail. */
export function starterThumb(s: Starter): CSSProperties {
  return s.kind === "gradient"
    ? { backgroundImage: s.ref }
    : { background: STARTER_PATTERNS[s.ref] };
}
