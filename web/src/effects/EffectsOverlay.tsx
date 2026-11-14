import type { Effect } from "../theme/schema";
import { GlyphRain } from "./GlyphRain";
import { useActiveEffects } from "./useActiveEffects";
import "./effects.css";

/**
 * Per-pane visual overlays. Purely visual: pointer-events none, nothing
 * touches terminal bytes, selection or copy.
 */
export function EffectsOverlay({
  effects,
  force = false,
  layer = "front",
}: {
  effects: readonly Effect[];
  /** Bench only: draw `effects` as given, ignoring user settings. */
  force?: boolean;
  /** "behind" draws glyph-rain under the text; "front" draws the rest over it. */
  layer?: "front" | "behind";
}) {
  const behind = layer === "behind";
  const active = useActiveEffects(effects, force).filter(
    (e) => (e.id === "glyph-rain") === behind,
  );
  if (!active.length) return null;
  return (
    <div
      className={behind ? "fx-root fx-behind" : "fx-root"}
      data-testid="fx-root"
      aria-hidden="true"
    >
      {active.map((e) =>
        e.id === "glyph-rain" ? (
          <GlyphRain key={e.id} intensity={e.intensity} />
        ) : (
          <div
            key={e.id}
            className={`fx fx-${e.id}`}
            data-fx={e.id}
            style={{ ["--fx-i" as string]: e.intensity }}
          >
            {e.id === "tracking" && <i />}
          </div>
        ),
      )}
    </div>
  );
}
