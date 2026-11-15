import { applyTemplate, TEMPLATES, type TemplateId } from "../layout/templates";
import { leaves, type Node } from "../layout/tree";
import { sceneToml } from "../presets/toml";

export type Slot = { preset: string; fontSize?: number };
export type Draft = {
  name: string;
  autostart: boolean;
  template: TemplateId;
  /** Split ratio of the root split (the main split). */
  ratio: number;
  /** Gap between panes, px. */
  gap: number;
  /** Pane opacity, 0..1. */
  opacity: number;
  /** Scene background colour ("" = none). */
  bg: string;
  slots: Slot[];
};

export const slotCount = (t: TemplateId): number =>
  TEMPLATES.find((x) => x.id === t)?.slots ?? 1;

export const resizeSlots = (slots: Slot[], t: TemplateId): Slot[] =>
  Array.from({ length: slotCount(t) }, (_, i) => slots[i] ?? { preset: "" });

export function newDraft(name: string): Draft {
  return {
    name,
    autostart: false,
    template: "2-up",
    ratio: 0.5,
    gap: 0,
    opacity: 1,
    bg: "",
    slots: resizeSlots([], "2-up"),
  };
}

/** Deterministic layout tree: slots s1..sN, splits x1.. */
export function buildTree(t: TemplateId, ratio?: number): Node {
  let p = 1;
  let x = 0;
  const { tree } = applyTemplate({ t: "leaf", id: "s1" }, t, (prefix) =>
    prefix === "p" ? `s${++p}` : `x${++x}`,
  );
  return ratio !== undefined && tree.t === "split" ? { ...tree, ratio } : tree;
}

export function draftToToml(d: Draft): string {
  const tree = buildTree(d.template, d.ratio);
  const ids = leaves(tree);
  const presets: Record<string, string> = {};
  const fontSize: Record<string, number> = {};
  ids.forEach((id, i) => {
    const s = d.slots[i];
    if (s?.preset) presets[id] = s.preset;
    if (s?.fontSize) fontSize[id] = s.fontSize;
  });
  return sceneToml(
    d.name,
    tree,
    presets,
    {},
    {
      top: [
        `autostart = ${d.autostart}`,
        `gap = ${d.gap}`,
        `pane_opacity = ${d.opacity}`,
      ],
      background: d.bg
        ? ['kind = "color"', `ref = ${JSON.stringify(d.bg)}`]
        : [],
      fontSize,
    },
  );
}

type Obj = Record<string, unknown>;

function value(raw: string, line: number): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Can't read the value on line ${line}.`);
  }
}

/** Reads the subset of TOML that draftToToml writes (tables, arrays of tables). */
function parseToml(src: string): Obj {
  const root: Obj = {};
  let cur = root;
  src.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    const n = i + 1;
    if (!line || line.startsWith("#")) return;
    const table = /^(\[\[?)\s*([\w.-]+)\s*\]\]?$/.exec(line);
    if (table) {
      const parts = table[2].split(".");
      let at = root;
      parts.forEach((k, j) => {
        let next = at[k];
        const last = j === parts.length - 1;
        if (table[1] === "[[" && last) {
          const arr = (next as Obj[] | undefined) ?? [];
          at[k] = arr;
          at = {};
          arr.push(at);
          return;
        }
        if (Array.isArray(next)) next = next[next.length - 1];
        if (!next) next = at[k] = {};
        at = next as Obj;
      });
      cur = at;
      return;
    }
    const kv = /^([\w-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) throw new Error(`Can't read line ${n}.`);
    cur[kv[1]] = value(kv[2], n);
  });
  return root;
}

function toNode(o: Obj | undefined): Node {
  if (!o) throw new Error("The scene has no layout.");
  if (o.type === "pane") return { t: "leaf", id: String(o.pane) };
  if (o.type !== "split") throw new Error("The layout has an unknown node.");
  return {
    t: "split",
    id: "x",
    dir: o.dir === "col" ? "col" : "row",
    ratio: Number(o.ratio ?? 0.5),
    a: toNode(o.a as Obj),
    b: toNode(o.b as Obj),
  };
}

const sig = (n: Node): string =>
  n.t === "leaf" ? "p" : `${n.dir}(${sig(n.a)},${sig(n.b)})`;

const TOP_KEYS = ["name", "autostart", "gap", "pane_opacity", "background"];

/** Refuse (rather than silently drop) anything the designer can't write back. */
function assertRoundTrips(o: Obj): void {
  const fail = (what: string): never => {
    throw new Error(
      `This scene uses ${what}, which the designer can't keep yet. Edit it as TOML in the file instead.`,
    );
  };
  for (const k of Object.keys(o))
    if (k !== "layout" && k !== "panes" && !TOP_KEYS.includes(k))
      fail(`"${k}"`);
  const bg = o.background as Obj | undefined;
  if (bg) {
    const keys = Object.keys(bg).filter((k) => k !== "ref");
    if (bg.kind !== "color" || keys.length !== 1) fail("this background");
  }
  for (const p of (o.panes as Obj[] | undefined) ?? []) {
    for (const k of Object.keys(p))
      if (k !== "id" && k !== "preset" && k !== "override")
        fail(`the pane setting "${k}"`);
    const ov = p.override as Obj | undefined;
    if (!ov) continue;
    const font = ov.font as Obj | undefined;
    const ok =
      Object.keys(ov).every((k) => k === "font") &&
      (!font || Object.keys(font).every((k) => k === "size"));
    if (!ok) fail("pane overrides");
  }
}

/** Parse scene TOML into a draft; throws a plain-text message on failure. */
export function parseDraft(src: string): Draft {
  const o = parseToml(src);
  assertRoundTrips(o);
  const tree = toNode(o.layout as Obj | undefined);
  const template = TEMPLATES.find(
    (t) => sig(buildTree(t.id)) === sig(tree),
  )?.id;
  if (!template) throw new Error("The layout doesn't match any snap layout.");
  const panes = new Map(
    ((o.panes as Obj[] | undefined) ?? []).map((p) => [String(p.id), p]),
  );
  const slots = leaves(tree).map((id): Slot => {
    const p = panes.get(id);
    const size = ((p?.override as Obj | undefined)?.font as Obj | undefined)
      ?.size;
    return {
      preset: String(p?.preset ?? ""),
      ...(typeof size === "number" ? { fontSize: size } : {}),
    };
  });
  const bg = o.background as Obj | undefined;
  return {
    name: String(o.name ?? ""),
    autostart: o.autostart === true,
    template,
    ratio: tree.t === "split" ? tree.ratio : 0.5,
    gap: Number(o.gap ?? 0),
    opacity: Number(o.pane_opacity ?? 1),
    bg: bg?.kind === "color" ? String(bg.ref ?? "") : "",
    slots,
  };
}
