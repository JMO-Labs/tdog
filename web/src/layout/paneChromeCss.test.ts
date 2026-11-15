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
  it("rounds head and body instead; body clips", () => {
    expect(rule(".pane-head")).toMatch(/border-radius:\s*12px 12px 0 0/);
    expect(rule(".pane-body")).toMatch(/border-radius:\s*0 0 12px 12px/);
    expect(rule(".pane-body")).toMatch(/overflow\s*:\s*hidden/);
  });
  it("header is 28px max and never wraps", () => {
    expect(rule(".pane-head")).toMatch(/height:\s*28px/);
    expect(rule(".pane-head")).toMatch(/flex-wrap:\s*nowrap/);
  });
  it("split buttons show on hover/focus only", () => {
    expect(rule(".pane-head .pane-split")).toMatch(/display:\s*none/);
    expect(css).toMatch(/\.pane-head:hover \.pane-split/);
    expect(css).toMatch(/\.pane-head:focus-within \.pane-split/);
  });
  it(".pane border and shadow stay inside its own cell", () => {
    const all =
      rule(".pane") +
      rule('.pane[data-focused="true"]') +
      rule(".pane::after") +
      rule('.pane[data-focused="true"]::after');
    // no outward (non-inset) shadow or spread ring may paint onto neighbours
    for (const layer of all.match(/box-shadow:[^;]*;/g) ?? [])
      for (const part of layer.replace("box-shadow:", "").split(/,(?![^(]*\))/))
        expect(part.trim()).toMatch(/^inset\b/);
  });
  it("ring and shadow paint above children via ::after", () => {
    const base = rule(".pane");
    expect(base).toMatch(/position\s*:\s*relative/);
    expect(base).not.toMatch(/box-shadow/); // would sit under the opaque head
    const after = rule(".pane::after");
    expect(after).toMatch(/content\s*:\s*""/);
    expect(after).toMatch(/position\s*:\s*absolute/);
    expect(after).toMatch(/inset\s*:\s*0/);
    expect(after).toMatch(/pointer-events\s*:\s*none/);
    expect(after).toMatch(/box-shadow\s*:\s*inset -4px -4px 0 var\(--shadow\)/);
    expect(rule('.pane[data-focused="true"]::after')).toMatch(
      /inset 0 0 0 3px var\(--accent/,
    );
  });
  it("theme vars cannot make a whole shadow layer outward", () => {
    const all = rule(".pane") + rule(".pane::after");
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
