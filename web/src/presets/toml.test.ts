import { expect, test } from "vitest";
import { sceneToml } from "./toml";
import type { Node } from "../layout/tree";

const tree: Node = {
  t: "split",
  id: "s1",
  dir: "row",
  ratio: 0.4,
  a: { t: "leaf", id: "p1" },
  b: { t: "leaf", id: "p2" },
};

test("writes layout tree and pane presets", () => {
  const out = sceneToml("dev", tree, { p1: "app-dev" });
  expect(out).toContain('name = "dev"');
  expect(out).toContain('[layout]\ntype = "split"\ndir = "row"\nratio = 0.4');
  expect(out).toContain('[layout.a]\ntype = "pane"\npane = "p1"');
  expect(out).toContain('[layout.b]\ntype = "pane"\npane = "p2"');
  expect(out).toContain('[[panes]]\nid = "p1"\npreset = "app-dev"');
  expect(out).toContain('[[panes]]\nid = "p2"\n');
  expect(out).not.toContain('id = "p2"\npreset');
});

test("escapes quotes in names", () => {
  expect(sceneToml('a"b', { t: "leaf", id: "p1" }, {})).toContain(
    'name = "a\\"b"',
  );
});

test("writes per-pane overrides for cwd, title and theme", () => {
  const out = sceneToml(
    "dev",
    tree,
    {},
    { p1: { cwd: "/srv", theme: "x", title: "api" } },
  );
  expect(out).toContain(
    '[[panes]]\nid = "p1"\n\n[panes.override]\ncwd = "/srv"\ntheme = "x"\nname = "api"\n',
  );
  expect(out).not.toContain('[panes.override]\n\n[[panes]]\nid = "p2"');
});
