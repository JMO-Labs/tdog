import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "layout.css"), "utf8");
const rule = (sel: string) =>
  [
    ...css.matchAll(
      new RegExp(
        `(?:^|\\n)${sel.replace(/[.\[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
        "g",
      ),
    ),
  ]
    .map((m) => m[1])
    .join("\n");

describe("pane chrome css", () => {
  it(".pane does not clip popovers", () => {
    expect(rule(".pane")).not.toMatch(/overflow\s*:\s*hidden/);
  });
  it("hairline: no pane radius, body clips", () => {
    expect(rule(".pane")).toMatch(/border-radius:\s*0/);
    expect(rule(".pane")).toMatch(/border:\s*0/);
    expect(rule(".pane-body")).toMatch(/overflow\s*:\s*hidden/);
  });
  it("header is 26px and never wraps", () => {
    expect(rule(".pane-head")).toMatch(/height:\s*26px/);
    expect(rule(".pane-head")).toMatch(/flex-wrap:\s*nowrap/);
  });
  it("title truncates instead of overflowing the header", () => {
    const t = rule(".pane-head .title");
    expect(t).toMatch(/min-width:\s*0/);
    expect(t).toMatch(/flex:\s*1 1 0/);
    expect(t).toMatch(/overflow:\s*hidden/);
    expect(t).toMatch(/text-overflow:\s*ellipsis/);
    expect(t).toMatch(/white-space:\s*nowrap/);
    expect(rule(".pane-actions")).toMatch(/flex:\s*none/);
    expect(rule(".pane-head .chip.broadcast")).toMatch(
      /background:\s*transparent/,
    );
  });
  it("actions hide by opacity only and show on hover/active/focus", () => {
    expect(rule(".pane-actions")).toMatch(/opacity:\s*0/);
    expect(css).not.toMatch(/visibility:\s*hidden/);
    expect(css).toMatch(/\.pane:hover \.pane-actions/);
    expect(css).toMatch(/\.pane:focus-within \.pane-actions/);
    expect(css).toMatch(/\.pane\[data-active="true"\] \.pane-actions/);
  });
  it(".pane border and shadow stay inside its own cell", () => {
    const all =
      rule(".pane") +
      rule(".pane-head") +
      rule('.pane[data-active="true"] .pane-head');
    // no outward (non-inset) shadow or spread ring may paint onto neighbours
    for (const layer of all.match(/box-shadow:[^;]*;/g) ?? [])
      for (const part of layer.replace("box-shadow:", "").split(/,(?![^(]*\))/))
        expect(part.trim()).toMatch(/^inset\b/);
  });
  it("theme vars cannot make a whole shadow layer outward", () => {
    const all = rule(".pane");
    expect(all).not.toMatch(/box-shadow\s*:\s*var\(/);
  });
  it(".pane is isolated so effect layers cannot escape", () => {
    expect(rule(".pane")).toMatch(/isolation\s*:\s*isolate/);
  });
  it("no other stylesheet or theme restyles .pane outward", () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const src = join(__dirname, "..");
    for (const f of walk(src).filter((f) => /\.(css|json)$/.test(f))) {
      if (f.endsWith("layout/layout.css")) continue;
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/\.pane(?![-\w])/);
    }
  });
  it("effect layers are clipped to the pane", () => {
    const fx = readFileSync(join(__dirname, "../effects/effects.css"), "utf8");
    expect(/\.fx-root\s*\{[^}]*overflow:\s*hidden/.test(fx)).toBe(true);
  });
});
