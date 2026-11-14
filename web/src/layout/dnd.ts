import { closeLeaf, leaves, newId, type Node } from "./tree";

export type Zone = "left" | "right" | "top" | "bottom" | "swap";
type Rect = { left: number; top: number; width: number; height: number };

/** Middle band (fraction of each axis) that means "swap". */
const CENTRE = [0.3, 0.7] as const;

/** Which drop zone a pointer is over: centre swaps, else the nearest edge. */
export function dropZone(x: number, y: number, r: Rect): Zone {
  if (r.width <= 0 || r.height <= 0) return "swap";
  const nx = (x - r.left) / r.width;
  const ny = (y - r.top) / r.height;
  const mid = (v: number) => v >= CENTRE[0] && v <= CENTRE[1];
  if (mid(nx) && mid(ny)) return "swap";
  const d = [
    ["left", nx],
    ["right", 1 - nx],
    ["top", ny],
    ["bottom", 1 - ny],
  ] as const;
  return d.reduce((m, c) => (c[1] < m[1] ? c : m))[0];
}

const mapIds = (n: Node, f: (id: string) => string): Node =>
  n.t === "leaf"
    ? { ...n, id: f(n.id) }
    : { ...n, a: mapIds(n.a, f), b: mapIds(n.b, f) };

/** Exchange two panes in place; the tree shape is untouched. */
export function swapPanes(n: Node, x: string, y: string): Node {
  const ids = leaves(n);
  if (x === y || !ids.includes(x) || !ids.includes(y)) return n;
  return mapIds(n, (id) => (id === x ? y : id === y ? x : id));
}

function dockBeside(n: Node, target: string, id: string, z: Zone): Node {
  if (n.t === "leaf") {
    if (n.id !== target) return n;
    const moved: Node = { t: "leaf", id };
    const first = z === "left" || z === "top";
    return {
      t: "split",
      id: newId("s"),
      dir: z === "left" || z === "right" ? "row" : "col",
      ratio: 0.5,
      a: first ? moved : n,
      b: first ? n : moved,
    };
  }
  return {
    ...n,
    a: dockBeside(n.a, target, id, z),
    b: dockBeside(n.b, target, id, z),
  };
}

/** Drop pane `id` onto pane `target` in zone `z`. No-op on bad input. */
export function movePane(n: Node, id: string, target: string, z: Zone): Node {
  const ids = leaves(n);
  if (id === target || !ids.includes(id) || !ids.includes(target)) return n;
  if (z === "swap") return swapPanes(n, id, target);
  const rest = closeLeaf(n, id);
  return rest ? dockBeside(rest, target, id, z) : n;
}

/** Next/previous pane in reading order (wraps); undefined if none. */
export function neighbour(
  n: Node,
  id: string,
  delta: 1 | -1,
): string | undefined {
  const ids = leaves(n);
  const i = ids.indexOf(id);
  if (i < 0 || ids.length < 2) return undefined;
  return ids[(i + delta + ids.length) % ids.length];
}

/** Id of the pane being dragged (dataTransfer is unreadable during dragover). */
let dragging: string | null = null;
export const PANE_MIME = "application/x-tdog-pane";
export const dragPane = (id: string | null) => {
  dragging = id;
};
export const draggedPane = () => dragging;
