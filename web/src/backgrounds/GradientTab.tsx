import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Slider } from "../components/ui/slider";
import {
  MAX_STOPS,
  MIN_STOPS,
  buildGradient,
  parseGradient,
  type GradientSpec,
} from "./gradient";
import type { BgSpec } from "./spec";

const DEFAULT: GradientSpec = {
  angle: 160,
  stops: [
    { color: "#ff7a59", pos: 0 },
    { color: "#2b1055", pos: 100 },
  ],
};

export function GradientTab({
  value,
  set,
}: {
  value: BgSpec;
  set: (p: Partial<BgSpec>) => void;
}) {
  const [g, setG] = useState<GradientSpec>(
    () => (value.kind === "gradient" && parseGradient(value.ref)) || DEFAULT,
  );
  const update = (next: GradientSpec) => {
    setG(next);
    set({ kind: "gradient", ref: buildGradient(next) });
  };
  const stop = (i: number, p: Partial<GradientSpec["stops"][number]>) =>
    update({
      ...g,
      stops: g.stops.map((s, j) => (j === i ? { ...s, ...p } : s)),
    });

  return (
    <div className="bgp-gradient">
      <div
        className="bgp-preview"
        style={{ backgroundImage: buildGradient(g) }}
        aria-hidden="true"
      />
      <label className="bgp-row">
        Angle
        <Slider
          aria-label="Angle"
          min={0}
          max={359}
          value={g.angle}
          onValueChange={(angle) => update({ ...g, angle })}
        />
      </label>
      {g.stops.map((s, i) => (
        <div key={i} className="bgp-stop">
          <Input
            type="color"
            aria-label={`Stop ${i + 1} colour`}
            value={s.color}
            onChange={(e) => stop(i, { color: e.target.value })}
          />
          <Slider
            aria-label={`Stop ${i + 1} position`}
            min={0}
            max={100}
            value={s.pos}
            onValueChange={(pos) => stop(i, { pos })}
          />
          <Button
            aria-label={`Remove stop ${i + 1}`}
            disabled={g.stops.length <= MIN_STOPS}
            onClick={() =>
              update({ ...g, stops: g.stops.filter((_, j) => j !== i) })
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        disabled={g.stops.length >= MAX_STOPS}
        onClick={() =>
          update({ ...g, stops: [...g.stops, { color: "#ffffff", pos: 50 }] })
        }
      >
        Add stop
      </Button>
    </div>
  );
}
