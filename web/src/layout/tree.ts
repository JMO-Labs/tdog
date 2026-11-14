/** Tiled split tree (ADR-0004): leaves are panes, splits hold two children. */
export type Dir = "row" | "col";
export type Node =
  | { t: "leaf"; id: string }
  | { t: "split"; id: string; dir: Dir; ratio: number; a: Node; b: Node };

export const MIN_RATIO = 0.1;
export const MAX_RATIO = 0.9;

export function leaves(n: Node): string[] {
  return n.t === "leaf" ? [n.id] : [...leaves(n.a), ...leaves(n.b)];
}

/** Replace leaf `id` with a split holding it and a new leaf `newId`. */
export function splitLeaf(
  n: Node,
  id: string,
  dir: Dir,
  newId: string,
  splitId: string,
): Node {
  if (n.t === "leaf") {
    if (n.id !== id) return n;
    return {
      t: "split",
      id: splitId,
      dir,
      ratio: 0.5,
      a: n,
      b: { t: "leaf", id: newId },
    };
  }
  return {
    ...n,
    a: splitLeaf(n.a, id, dir, newId, splitId),
    b: splitLeaf(n.b, id, dir, newId, splitId),
  };
}

/** Remove leaf `id`; its sibling takes the parent's place. Null when empty. */
export function closeLeaf(n: Node, id: string): Node | null {
  if (n.t === "leaf") return n.id === id ? null : n;
  const a = closeLeaf(n.a, id);
  const b = closeLeaf(n.b, id);
  if (!a) return b;
  if (!b) return a;
  return a === n.a && b === n.b ? n : { ...n, a, b };
}

export function setRatio(n: Node, splitId: string, ratio: number): Node {
  if (n.t === "leaf") return n;
  if (n.id === splitId) {
    return { ...n, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) };
  }
  return {
    ...n,
    a: setRatio(n.a, splitId, ratio),
    b: setRatio(n.b, splitId, ratio),
  };
}

let seq = 0;
/** Short unique id; doubles as the server session `scene` (max 64 chars). */
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
