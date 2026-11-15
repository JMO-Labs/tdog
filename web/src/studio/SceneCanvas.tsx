import type { ReactNode } from "react";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { leaves, type Node } from "../layout/tree";
import { buildTree, type Draft, type Slot } from "./sceneModel";

type Props = {
  draft: Draft;
  presets: string[];
  /** Resolved theme name per preset, for the thumbnails. */
  looks: Record<string, string>;
  onSlot: (index: number, patch: Partial<Slot>) => void;
};

/** Live preview of the scene: each slot is a tile with its preset picker. */
export function SceneCanvas({ draft, presets, looks, onSlot }: Props) {
  const order = leaves(buildTree(draft.template));
  const tile = (id: string) => {
    const i = order.indexOf(id);
    const slot = draft.slots[i] ?? { preset: "" };
    const n = i + 1;
    return (
      <div
        key={id}
        className="scene-tile"
        style={{ opacity: draft.opacity }}
        data-testid={`slot-${n}`}
      >
        <div className="scene-look" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span className="scene-look-name">
          {slot.preset ? (looks[slot.preset] ?? "…") : "Empty"}
        </span>
        <Select
          aria-label={`Terminal for slot ${n}`}
          value={slot.preset}
          onChange={(e) => onSlot(i, { preset: e.target.value })}
        >
          <option value="">Empty shell</option>
          {presets.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min={6}
          max={72}
          aria-label={`Font size for slot ${n}`}
          placeholder="Font size"
          value={slot.fontSize ?? ""}
          onChange={(e) =>
            onSlot(i, {
              fontSize: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>
    );
  };
  const node = (n: Node, root = false): ReactNode => {
    if (n.t === "leaf") return tile(n.id);
    const r = root ? draft.ratio : n.ratio;
    return (
      <div
        key={n.id}
        className="scene-split"
        style={{
          flexDirection: n.dir,
          gap: draft.gap,
        }}
      >
        <div style={{ flex: `${r} 1 0` }} className="scene-cell">
          {node(n.a)}
        </div>
        <div style={{ flex: `${1 - r} 1 0` }} className="scene-cell">
          {node(n.b)}
        </div>
      </div>
    );
  };
  return (
    <div
      className="scene-canvas"
      aria-label="Scene preview"
      role="group"
      style={{ background: draft.bg || undefined }}
    >
      {node(buildTree(draft.template, draft.ratio), true)}
    </div>
  );
}
