import { leaves, type Dir, type Node } from "../layout/tree";

/** What a saved scene remembers about one pane (client side). */
export type SavedPane = {
  preset?: string;
  cwd?: string;
  title?: string;
  theme?: string;
};
export type Saved =
  | ({ t: "leaf" } & SavedPane)
  | { t: "split"; dir: Dir; ratio: number; a: Saved; b: Saved };
export type PaneInfoFn = (id: string) => SavedPane;

const KEY = "tdog.sceneSaves";
const subs = new Set<() => void>();
export const onSavesChange = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

/** Same slug rule as the server (internal/config/store.go). */
export const validName = (n: string) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(n);

function read(): Record<string, Saved> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, Saved>)
      : {};
  } catch {
    return {};
  }
}
export const getSave = (name: string): Saved | undefined => read()[name];
export function putSave(name: string, s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [name]: s }));
  } catch {
    /* storage unavailable: the scene still saved on the server */
  }
  subs.forEach((f) => f());
}

const clean = (p: SavedPane): SavedPane =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as SavedPane;

/** Layout with split sizes plus each pane's preset, cwd, title and theme. */
export function snapshot(n: Node, info: PaneInfoFn): Saved {
  if (n.t === "leaf") {
    return { t: "leaf", ...clean({ ...info(n.id), title: n.title }) };
  }
  return {
    t: "split",
    dir: n.dir,
    ratio: n.ratio,
    a: snapshot(n.a, info),
    b: snapshot(n.b, info),
  };
}

/** Does the live scene differ from its saved snapshot? Unknown live values (cwd not reported yet) don't count. */
export function isDirty(s: Saved, n: Node, info: PaneInfoFn): boolean {
  if (s.t === "split") {
    return (
      n.t !== "split" ||
      s.dir !== n.dir ||
      Math.abs(s.ratio - n.ratio) > 0.005 ||
      isDirty(s.a, n.a, info) ||
      isDirty(s.b, n.b, info)
    );
  }
  if (n.t !== "leaf") return true;
  const live = info(n.id);
  return (
    (s.title ?? "") !== (n.title ?? "") ||
    (live.cwd !== undefined && live.cwd !== (s.cwd ?? live.cwd)) ||
    (live.theme ?? "") !== (s.theme ?? "") ||
    (live.preset ?? "") !== (s.preset ?? "")
  );
}

/** Put saved titles on a freshly started tree and list its pane themes. */
export function applySaved(
  s: Saved,
  tree: Node,
): { tree: Node; themes: Record<string, string> } {
  const panes: SavedPane[] = [];
  const walk = (x: Saved): void => {
    if (x.t === "leaf") panes.push(x);
    else {
      walk(x.a);
      walk(x.b);
    }
  };
  walk(s);
  const ids = leaves(tree);
  const themes: Record<string, string> = {};
  ids.forEach((id, i) => {
    if (panes[i]?.theme) themes[id] = panes[i].theme;
  });
  const put = (n: Node): Node =>
    n.t === "split"
      ? { ...n, a: put(n.a), b: put(n.b) }
      : panes[ids.indexOf(n.id)]?.title
        ? { ...n, title: panes[ids.indexOf(n.id)].title }
        : n;
  return { tree: put(tree), themes };
}
