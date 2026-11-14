import { expect, test } from "vitest";
import { applyTemplate, TEMPLATES, type TemplateId } from "./templates";
import { leaves, type Node } from "./tree";

let n = 0;
const mk = (p: string) => `${p}${++n}`;
const leaf = (id: string): Node => ({ t: "leaf", id });

/** Compact shape: leaf "x", split "row(a,b)" / "col(a,b)". */
const shape = (t: Node): string =>
  t.t === "leaf" ? "x" : `${t.dir}(${shape(t.a)},${shape(t.b)})`;

const SHAPES: Record<TemplateId, [number, string]> = {
  single: [1, "x"],
  "2-up": [2, "row(x,x)"],
  "3-col": [3, "row(x,row(x,x))"],
  "1+2": [3, "row(x,col(x,x))"],
  "2x2": [4, "col(row(x,x),row(x,x))"],
  "1+3": [4, "row(x,col(x,col(x,x)))"],
};

test("six templates", () => {
  expect(TEMPLATES.map((t) => t.id)).toEqual(Object.keys(SHAPES));
});

for (const [id, [slots, s]] of Object.entries(SHAPES)) {
  test(`${id}: ${slots} slots, shape ${s}`, () => {
    const r = applyTemplate(leaf("a"), id as TemplateId, mk);
    expect(shape(r.tree)).toBe(s);
    expect(leaves(r.tree)).toHaveLength(slots);
    expect(r.surplus).toEqual([]);
  });
}

test("existing panes keep order; extra slots are new leaves", () => {
  const r = applyTemplate(leaf("a"), "2x2", mk);
  expect(leaves(r.tree)[0]).toBe("a");
  expect(r.added).toHaveLength(3);
});

test("3-col gives equal thirds", () => {
  const r = applyTemplate(leaf("a"), "3-col", mk).tree;
  if (r.t !== "split" || r.b.t !== "split") throw new Error("shape");
  expect(r.ratio).toBeCloseTo(1 / 3);
  expect(r.b.ratio).toBeCloseTo(0.5);
});

test("surplus panes are reported, not dropped from the input", () => {
  const cur = applyTemplate(leaf("a"), "2x2", mk).tree;
  const order = leaves(cur);
  const r = applyTemplate(cur, "2-up", mk);
  expect(leaves(r.tree)).toEqual(order.slice(0, 2));
  expect(r.surplus).toEqual(order.slice(2));
});
