import { Orientation, type SplitviewApi } from "dockview-react";
import type { Dir } from "./tree";

/** Smallest pane edge in px; dockview stops the sash there. */
export const MIN_PANE = 60;

export const orientation = (d: Dir) =>
  d === "row" ? Orientation.HORIZONTAL : Orientation.VERTICAL;

/** Main-axis length of a dockview splitview or panel. */
const span = (d: Dir, x: { width: number; height: number }): number =>
  d === "row" ? x.width : x.height;

/**
 * Fill a two-child dockview splitview ("a" then "b") sized by `ratio`, and
 * report the new ratio whenever a sash drag or container resize relayouts it.
 */
export function mountSplit(
  api: SplitviewApi,
  dir: Dir,
  ratio: number,
  onLayout: (ratio: number) => void,
): void {
  const add = (id: string, size?: number) =>
    api.addPanel({ id, component: "child", minimumSize: MIN_PANE, size });
  const total = span(dir, api);
  const sized = total > 0;
  add("a", sized ? total * ratio : undefined);
  add("b", sized ? total * (1 - ratio) : undefined);
  api.onDidLayoutChange(() => {
    const t = span(dir, api);
    const first = api.panels[0];
    if (t > 0 && first) onLayout(span(dir, first.api) / t);
  });
}
