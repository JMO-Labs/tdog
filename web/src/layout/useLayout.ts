import { useCallback, useEffect, useState } from "react";
import { killScene } from "../terminal/sessions";
import { loadLayout, saveLayout } from "./store";
import {
  closeLeaf,
  newId,
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
  const reset = useCallback(() => setTree(fresh()), []);

  return { tree, split, close, ratio, reset };
}
