import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "shell.css"), "utf8");

const rule = (sel: string) => {
  const esc = sel.replace(/[.[\]"=()]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : "";
};

test("header is a hairline bar with no motif strip", () => {
  const h = rule(".ws-head");
  expect(h).toContain("background: var(--surface)");
  expect(h).toContain("border-bottom: 1px solid var(--line)");
  expect(css).not.toContain("--header-motif");
  expect(rule(".ws-head::after")).toBe("");
});

test("wordmark has an accent shadow, off in serious mode", () => {
  const w = rule(".ws-head .wordmark.small");
  expect(w).toContain("text-shadow: 1.5px 1.5px 0 var(--accent)");
  expect(rule("html[data-serious] .ws-head .wordmark.small")).toContain(
    "text-shadow: none",
  );
});

test("active tab is fg with a 2px accent underline", () => {
  expect(rule(".tab")).toContain("color: var(--muted)");
  expect(rule(".tab.on")).toContain("color: var(--fg)");
  expect(rule(".tab.on::after")).toContain("height: 2px");
  expect(rule(".tab.on::after")).toContain("var(--accent)");
});

test("status bar is 24px and plain", () => {
  const s = rule(".status");
  expect(s).toContain("height: 24px");
  expect(s).toContain("gap: 14px");
});

test("header icon buttons are ghost", () => {
  expect(rule(".ws-head .icon-btn")).toContain("box-shadow: none");
  expect(rule(".ws-head .icon-btn:hover")).toContain("var(--surface-2)");
});
