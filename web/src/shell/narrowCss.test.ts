import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const shell = read("narrow.css");

test("narrow breakpoints exist", () => {
  expect(shell).toContain("@media (max-width: 639px)");
  expect(shell).toContain("@media (max-width: 479px)");
  expect(shell).toContain("min-height: 40px");
});

test("sheets go full width on phones", () => {
  const o = read("../overlays/overlays.css");
  expect(o).toContain("@media (max-width: 639px)");
  expect(o).toMatch(/\.dialog\.sheet\s*\{[^}]*width: 100vw/);
});

test("tabs can shrink and scroll on phones", () => {
  expect(shell).toMatch(/\.ws-head \.tabs\s*\{[^}]*flex: 0 1 auto/);
});
