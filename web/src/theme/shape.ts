import type { ChromeScope } from "./schema";

type Shape = ChromeScope["shape"];

/** Shadow style → [rest, hover, pressed] box-shadow values, built from the --shadow token. */
const SHADOWS: Record<Shape["shadow"], [string, string, string]> = {
  hard: [
    "4px 4px 0 var(--shadow)",
    "6px 6px 0 var(--shadow)",
    "0 0 0 var(--shadow)",
  ],
  soft: [
    "0 4px 14px color-mix(in srgb, var(--shadow) 40%, transparent)",
    "0 8px 22px color-mix(in srgb, var(--shadow) 45%, transparent)",
    "0 1px 4px color-mix(in srgb, var(--shadow) 40%, transparent)",
  ],
  bevel: [
    "inset 2px 2px 0 rgb(255 255 255 / 0.45), inset -2px -2px 0 var(--shadow)",
    "inset 2px 2px 0 rgb(255 255 255 / 0.6), inset -2px -2px 0 var(--shadow)",
    "inset 2px 2px 0 var(--shadow), inset -2px -2px 0 rgb(255 255 255 / 0.45)",
  ],
  glow: [
    "0 0 10px var(--shadow), 0 0 2px var(--shadow)",
    "0 0 18px var(--shadow), 0 0 4px var(--shadow)",
    "0 0 4px var(--shadow)",
  ],
  none: ["none", "none", "none"],
};

const pretty = (n: number) => String(Math.round(n * 1000) / 1000);

/** CSS custom properties for a theme's chrome shape; the control kit reads only these. */
export function shapeVars(shape: Shape): Record<string, string> {
  const [md, lg, press] = SHADOWS[shape.shadow];
  return {
    "--radius-scale": pretty(shape.radius),
    "--border-width": pretty(shape.border),
    "--shadow-style": shape.shadow,
    "--shadow-md": md,
    "--shadow-lg": lg,
    "--shadow-press": press,
  };
}
