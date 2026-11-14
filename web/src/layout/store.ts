import type { Node } from "./tree";

const key = (scene: string) => `tdog.layout.${scene}`;

function valid(n: unknown): n is Node {
  if (!n || typeof n !== "object") return false;
  const o = n as Record<string, unknown>;
  if (typeof o.id !== "string") return false;
  if (o.t === "leaf") return true;
  return (
    o.t === "split" &&
    (o.dir === "row" || o.dir === "col") &&
    typeof o.ratio === "number" &&
    valid(o.a) &&
    valid(o.b)
  );
}

/** Persist a scene's tree (null = no panes). Storage errors are ignored. */
export function saveLayout(scene: string, tree: Node | null): void {
  try {
    localStorage.setItem(key(scene), JSON.stringify(tree));
  } catch {
    /* private mode / quota: layout just won't persist */
  }
}

/** Saved tree, null for an emptied scene, undefined when nothing usable. */
export function loadLayout(scene: string): Node | null | undefined {
  try {
    const raw = localStorage.getItem(key(scene));
    if (raw === null) return undefined;
    const v: unknown = JSON.parse(raw);
    if (v === null) return null;
    return valid(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
