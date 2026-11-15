import type { Dir, Node } from "./tree";

/**
 * Renderer-agnostic scene layout (mirrors internal/config/layout.go): splits
 * with a ratio and pane slots naming a scene pane id. Unlike the web tree it
 * carries no split ids or titles.
 */
export type SceneLayout =
  | { type: "pane"; pane: string }
  | { type: "split"; dir: Dir; ratio: number; a: SceneLayout; b: SceneLayout };

export function toSceneLayout(n: Node): SceneLayout {
  if (n.t === "leaf") return { type: "pane", pane: n.id };
  return {
    type: "split",
    dir: n.dir,
    ratio: n.ratio,
    a: toSceneLayout(n.a),
    b: toSceneLayout(n.b),
  };
}

/** Split ids are regenerated in depth-first order: s1, s2, ... */
export function fromSceneLayout(l: SceneLayout): Node {
  let next = 0;
  const walk = (x: SceneLayout): Node => {
    if (x.type === "pane") return { t: "leaf", id: x.pane };
    const id = `s${++next}`;
    const a = walk(x.a);
    const b = walk(x.b);
    return { t: "split", id, dir: x.dir, ratio: x.ratio, a, b };
  };
  return walk(l);
}
