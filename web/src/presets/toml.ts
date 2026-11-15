import { leaves, type Node } from "../layout/tree";

const q = (s: string) => JSON.stringify(s);

function layout(n: Node, path: string, out: string[]) {
  out.push(`[${path}]`);
  if (n.t === "leaf") {
    out.push('type = "pane"', `pane = ${q(n.id)}`, "");
    return;
  }
  out.push('type = "split"', `dir = ${q(n.dir)}`, `ratio = ${n.ratio}`, "");
  layout(n.a, `${path}.a`, out);
  layout(n.b, `${path}.b`, out);
}

/** Optional designer fields: top-level lines, [background] lines, font sizes. */
export type SceneExtras = {
  top?: string[];
  background?: string[];
  fontSize?: Record<string, number>;
};

/** Scene preset TOML: the layout tree plus one pane slot per leaf. */
export function sceneToml(
  name: string,
  tree: Node,
  presets: Record<string, string>,
  extras: SceneExtras = {},
): string {
  const out = [`name = ${q(name)}`, ...(extras.top ?? []), ""];
  if (extras.background?.length)
    out.push("[background]", ...extras.background, "");
  layout(tree, "layout", out);
  for (const id of leaves(tree)) {
    out.push("[[panes]]", `id = ${q(id)}`);
    if (presets[id]) out.push(`preset = ${q(presets[id])}`);
    out.push("");
    const size = extras.fontSize?.[id];
    if (size) out.push("[panes.override.font]", `size = ${size}`, "");
  }
  return out.join("\n");
}
