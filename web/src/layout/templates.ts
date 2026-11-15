import { newId, type Dir, type Node } from "./tree";

export type TemplateId = "single" | "2-up" | "3-col" | "1+2" | "2x2" | "1+3";

/** Layout spec: slot count plus a recipe over a slot list. */
type Spec = (s: Node[], id: () => string) => Node;
const split = (
  dir: Dir,
  ratio: number,
  a: Node,
  b: Node,
  id: () => string,
): Node => ({ t: "split", id: id(), dir, ratio, a, b });

const SPECS: Record<TemplateId, { label: string; slots: number; build: Spec }> =
  {
    single: { label: "Single", slots: 1, build: (s) => s[0] },
    "2-up": {
      label: "2-up",
      slots: 2,
      build: (s, id) => split("row", 0.5, s[0], s[1], id),
    },
    "3-col": {
      label: "3 columns",
      slots: 3,
      build: (s, id) =>
        split("row", 1 / 3, s[0], split("row", 0.5, s[1], s[2], id), id),
    },
    "1+2": {
      label: "1 + 2",
      slots: 3,
      build: (s, id) =>
        split("row", 0.5, s[0], split("col", 0.5, s[1], s[2], id), id),
    },
    "2x2": {
      label: "2 × 2",
      slots: 4,
      build: (s, id) =>
        split(
          "col",
          0.5,
          split("row", 0.5, s[0], s[1], id),
          split("row", 0.5, s[2], s[3], id),
          id,
        ),
    },
    "1+3": {
      label: "1 + 3",
      slots: 4,
      build: (s, id) =>
        split(
          "row",
          0.5,
          s[0],
          split("col", 1 / 3, s[1], split("col", 0.5, s[2], s[3], id), id),
          id,
        ),
    },
  };

export const TEMPLATES = (Object.keys(SPECS) as TemplateId[]).map((id) => ({
  id,
  label: SPECS[id].label,
  slots: SPECS[id].slots,
}));

function order(n: Node): string[] {
  return n.t === "leaf" ? [n.id] : [...order(n.a), ...order(n.b)];
}

export interface Applied {
  tree: Node;
  /** New empty pane ids. */
  added: string[];
  /** Existing panes that do not fit; the caller must ask before closing. */
  surplus: string[];
}

/** Rebuild `cur` as template `t`: panes keep order, extra slots are new leaves. */
export function applyTemplate(
  cur: Node,
  t: TemplateId,
  mkId: (prefix: string) => string = newId,
): Applied {
  const { slots, build } = SPECS[t];
  const have = order(cur);
  const kept = have.slice(0, slots);
  const added = Array.from({ length: slots - kept.length }, () => mkId("p"));
  const nodes = [...kept, ...added].map((id): Node => ({ t: "leaf", id }));
  return {
    tree: build(nodes, () => mkId("s")),
    added,
    surplus: have.slice(slots),
  };
}
