import type { Effect } from "../theme/schema";
import { GlyphRain } from "./GlyphRain";
import { resolveEffects } from "./resolve";
import { useFx, usePageVisible, useReducedMotionPref } from "./store";
import "./effects.css";

/**
 * Per-pane visual overlays. Purely visual: pointer-events none, nothing
 * touches terminal bytes, selection or copy.
 */
export function EffectsOverlay({ effects }: { effects: readonly Effect[] }) {
  const settings = useFx();
  const reduced = useReducedMotionPref();
  const visible = usePageVisible();
  const active = resolveEffects(effects, settings, reduced, visible);
  if (!active.length) return null;
  return (
    <div className="fx-root" data-testid="fx-root" aria-hidden="true">
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
