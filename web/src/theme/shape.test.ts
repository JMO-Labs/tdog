import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { shapeVars } from "./shape";

test("maps scale tokens", () => {
  const v = shapeVars({ radius: 1.5, shadow: "hard", border: 2 });
  expect(v["--radius-scale"]).toBe("1.5");
  expect(v["--border-width"]).toBe("2");
});

test("hard shadow is a hard offset in the shadow color", () => {
  const v = shapeVars({ radius: 1, shadow: "hard", border: 1 });
  expect(v["--shadow-md"]).toBe("4px 4px 0 var(--shadow)");
  expect(v["--shadow-press"]).toBe("0 0 0 var(--shadow)");
});

test("each style yields a distinct shadow, none disables it", () => {
  const md = (s: any) =>
    shapeVars({ radius: 1, shadow: s, border: 1 })["--shadow-md"];
  const all = (["hard", "soft", "bevel", "glow", "none"] as const).map(md);
  expect(new Set(all).size).toBe(5);
  expect(md("none")).toBe("none");
  expect(md("glow")).toContain("var(--shadow)");
  expect(md("bevel")).toContain("inset");
});

test("hard tiers equal the index.css defaults", () => {
  const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
  const v = shapeVars({ radius: 1, shadow: "hard", border: 1 });
  for (const t of ["xs", "sm", "md", "lg", "xl"]) {
    const m = css.match(new RegExp(`--shadow-${t}: ([^;]+);`));
    expect(m?.[1], t).toBe(v[`--shadow-${t}`]);
  }
});
