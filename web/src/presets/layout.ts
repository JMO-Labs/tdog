import { fromSceneLayout } from "../layout/sceneLayout";
import { newId, type Node } from "../layout/tree";
import type { LayoutDto, SceneRun } from "./api";

/**
 * Turn a started scene into a web layout tree. Slots get fresh pane ids; each
 * id maps to the server session launched for that slot. Without a layout the
 * panes sit side by side.
 */
export function runToTree(run: SceneRun): {
  tree: Node;
  sessions: Record<string, string>;
} {
  const ids: Record<string, string> = {};
  const sessions: Record<string, string> = {};
  for (const p of run.panes) {
    ids[p.pane] = newId("p");
    sessions[ids[p.pane]] = p.session;
  }
  const slot = (pane: string): LayoutDto => ({ type: "pane", pane });
  const chain = (slots: string[]): LayoutDto =>
    slots.length < 2
      ? slot(slots[0])
      : {
          type: "split",
          dir: "row",
          ratio: 1 / slots.length,
          a: slot(slots[0]),
          b: chain(slots.slice(1)),
        };
  const dto = run.layout ?? chain(run.panes.map((p) => p.pane));
  const rename = (l: LayoutDto): LayoutDto =>
    l.type === "pane"
      ? slot(ids[l.pane] ?? newId("p"))
      : { ...l, a: rename(l.a), b: rename(l.b) };
  return { tree: fromSceneLayout(rename(dto)), sessions };
}
