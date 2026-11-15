import { useCallback, useEffect, useState } from "react";
import { killScene } from "../terminal/sessions";
import { applyTemplate, type TemplateId } from "./templates";
import { movePane, neighbour, swapPanes, type Zone } from "./dnd";
import { loadLayout, saveLayout } from "./store";
import { onLayoutChange } from "./transfer";
import {
  closeLeaf,
  newId,
  renameLeaf,
  setRatio,
  splitLeaf,
  type Dir,
  type Node,
} from "./tree";

const fresh = (): Node => ({ t: "leaf", id: newId("p") });

/** Split-tree state for one scene, persisted to localStorage. */
export function useLayout(scene: string) {
  const [tree, setTree] = useState<Node | null>(() => {
    const saved = loadLayout(scene);
    return saved === undefined ? fresh() : saved;
  });

  useEffect(() => saveLayout(scene, tree), [scene, tree]);
  // A pane moved in/out of this scene from elsewhere rewrote storage.
  useEffect(
    () => onLayoutChange(scene, () => setTree(loadLayout(scene) ?? null)),
    [scene],
  );

  const split = useCallback(
    (id: string, dir: Dir) =>
      setTree((t) => (t ? splitLeaf(t, id, dir, newId("p"), newId("s")) : t)),
    [],
  );
  const close = useCallback((id: string) => {
    void killScene(id);
    setTree((t) => (t ? closeLeaf(t, id) : t));
  }, []);
  const ratio = useCallback(
    (splitId: string, r: number) =>
      setTree((t) => (t ? setRatio(t, splitId, r) : t)),
    [],
  );
  /** Rebuild as a template. Surplus panes are only closed once `confirmed`;
   * otherwise nothing changes and their ids are returned so the UI can ask. */
  const snap = useCallback(
    (t: TemplateId, confirmed = false): string[] => {
      if (!tree) return [];
      const r = applyTemplate(tree, t);
      if (r.surplus.length && !confirmed) return r.surplus;
      r.surplus.forEach((id) => void killScene(id));
      setTree(r.tree);
      return [];
    },
    [tree],
  );
  const move = useCallback(
    (id: string, target: string, zone: Zone) =>
      setTree((t) => (t ? movePane(t, id, target, zone) : t)),
    [],
  );
  const swap = useCallback(
    (id: string, delta: 1 | -1) =>
      setTree((t) => {
        const other = t && neighbour(t, id, delta);
        return t && other ? swapPanes(t, id, other) : t;
      }),
    [],
  );
  const rename = useCallback(
    (id: string, title: string) =>
      setTree((t) => (t ? renameLeaf(t, id, title) : t)),
    [],
  );
  /** New pane to the right. Panes are all local shells and the client does not
   * know a shell's cwd, so "same target and cwd" is a fresh local shell. */
  const duplicate = useCallback(
    (id: string) =>
      setTree((t) => (t ? splitLeaf(t, id, "row", newId("p"), newId("s")) : t)),
    [],
  );
  const reset = useCallback(() => setTree(fresh()), []);
  /** Start over with a single pane `id`. */
  const open = useCallback((id: string) => setTree({ t: "leaf", id }), []);

  return {
    tree,
    split,
    close,
    ratio,
    snap,
    move,
    swap,
    rename,
    duplicate,
    reset,
    open,
  };
}
