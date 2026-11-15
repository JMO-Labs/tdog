import type { Effect } from "../theme/schema";

export type FxId = Effect["id"];
export const ANIMATED: readonly FxId[] = [
  "grain",
  "flicker",
  "glyph-rain",
  "tracking",
];
export const FX_LABELS: Record<FxId, string> = {
  scanlines: "Scanlines",
  glow: "Glow",
  vignette: "Vignette",
  grain: "Grain",
  flicker: "Flicker",
  "glyph-rain": "Glyph rain",
  tracking: "Tracking",
};

export const EFFECT_IDS = Object.keys(FX_LABELS) as FxId[];

export interface FxSettings {
  master: boolean;
  /** 0..1 multiplier applied on top of each theme effect's intensity. */
  intensity: number;
  on: Record<FxId, boolean>;
}

export const DEFAULT_FX: FxSettings = {
  master: true,
  intensity: 1,
  on: {
    scanlines: true,
    glow: true,
    vignette: true,
    grain: true,
    flicker: false,
    "glyph-rain": true,
    tracking: false,
  },
};

/**
 * Effects to draw for a pane: theme list × user settings × motion state.
 * Animated effects drop when motion is reduced or the tab is hidden.
 */
export function resolveEffects(
  themeEffects: readonly Effect[],
  settings: FxSettings,
  reducedMotion: boolean,
  visible: boolean,
): Effect[] {
  if (!settings.master) return [];
  const still = reducedMotion || !visible;
  const out: Effect[] = [];
  for (const e of themeEffects) {
    if (!settings.on[e.id]) continue;
    if (still && ANIMATED.includes(e.id)) continue;
    const intensity = e.intensity * settings.intensity;
    if (intensity > 0) out.push({ id: e.id, intensity });
  }
  return out;
}
