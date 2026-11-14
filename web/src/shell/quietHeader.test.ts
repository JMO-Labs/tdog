import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("./shell.css", import.meta.url), "utf8");
const rule = (sel: string) => {
  const esc = sel.replace(/[.[\]"=()]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : "";
};

test("header is plain surface with a 4px accent strip", () => {
  const h = rule(".ws-head");
  expect(h).toContain("background: var(--surface)");
  expect(h).not.toContain("--pattern");
  expect(h).not.toContain("border-bottom");
  const s = rule(".ws-head::after");
  expect(s).toContain("height: 4px");
  for (const t of ["pink", "cyan", "yellow", "purple"])
    expect(s).toContain(`var(--${t})`);
  expect(s).toContain("repeating-linear-gradient");
});

test("wordmark is quiet", () => {
  const w = rule(".ws-head .wordmark.small");
  expect(w).toContain("color: var(--fg)");
  expect(w).toContain("text-shadow: 2px 2px 0 var(--pink)");
  expect(w).toContain("animation: none");
  expect(w).toContain("-webkit-text-stroke: 0");
});

test("tabs are flat with a flat yellow pill", () => {
  const t = rule(".tabs");
  expect(t).toContain("background: var(--surface-2)");
  expect(t).not.toContain("box-shadow: 4px");
  expect(rule(".tab")).toContain("color: var(--muted)");
  const p = rule(".tab-pill");
  expect(p).toContain("1.5px solid var(--line)");
  expect(p).toContain("background: var(--yellow)");
  expect(p).not.toContain("gradient");
});

test("header icon buttons are ghost", () => {
  expect(rule(".ws-head .icon-btn")).toContain("box-shadow: none");
  expect(rule(".ws-head .icon-btn:hover")).toContain("var(--surface-2)");
  expect(rule(".ws-head .icon-btn.danger:hover")).toContain("var(--pink)");
});
