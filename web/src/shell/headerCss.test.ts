import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "shell.css"), "utf8");

test("header is 40px tall and does not clip popovers", () => {
  const m = css.match(/\n\.ws-head\s*\{([^}]*)\}/);
  expect(m?.[1]).toContain("height: 40px");
  expect(m?.[1]).not.toContain("overflow");
});
