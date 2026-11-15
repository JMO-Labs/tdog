import { loadLayout, saveLayout } from "./store";
import { closeLeaf, leaves, newId, type Node } from "./tree";

const subs = new Map<string, Set<() => void>>();

/** Subscribe to out-of-band layout rewrites of one scene (cross-scene moves). */
export function onLayoutChange(scene: string, fn: () => void): () => void {
  const set = subs.get(scene) ?? new Set();
  set.add(fn);
  subs.set(scene, set);
  return () => void set.delete(fn);
}
const notify = (scene: string) => subs.get(scene)?.forEach((f) => f());

/**
 * Move pane `id` (and so its live shell, keyed by the pane id) from scene
 * `from` to scene `to`. Persists both trees and notifies their views.
 */
export function moveToScene(id: string, from: string, to: string): boolean {
  if (from === to) return false;
  const src = loadLayout(from);
  if (!src || !leaves(src).includes(id)) return false;
  const dst = loadLayout(to) ?? null;
  const leaf: Node = { t: "leaf", id };
  const next: Node = dst
    ? { t: "split", id: newId("s"), dir: "row", ratio: 0.5, a: dst, b: leaf }
    : leaf;
  saveLayout(from, closeLeaf(src, id));
  saveLayout(to, next);
  notify(from);
  notify(to);
  return true;
}

/** Add a new pane `id` to scene `scene` (beside the existing tree, if any). */
export function addLeaf(scene: string, id: string): void {
  const cur = loadLayout(scene) ?? null;
  const leaf: Node = { t: "leaf", id };
  saveLayout(
    scene,
    cur
      ? { t: "split", id: newId("s"), dir: "row", ratio: 0.5, a: cur, b: leaf }
      : leaf,
  );
  notify(scene);
}
