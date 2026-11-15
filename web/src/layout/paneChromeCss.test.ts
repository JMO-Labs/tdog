import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "layout.css"), "utf8");
const rule = (sel: string) =>
  new RegExp(
    `(?:^|\\n)${sel.replace(/[.\[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
  ).exec(css)?.[1] ?? "";

describe("pane chrome css", () => {
  it(".pane does not clip popovers", () => {
    expect(rule(".pane")).not.toMatch(/overflow\s*:\s*hidden/);
  });
  it("rounds head and body instead; body clips", () => {
    expect(rule(".pane-head")).toMatch(/border-radius:\s*12px 12px 0 0/);
    expect(rule(".pane-body")).toMatch(/border-radius:\s*0 0 12px 12px/);
    expect(rule(".pane-body")).toMatch(/overflow\s*:\s*hidden/);
  });
  it(".snap-pop anchors to the right edge", () => {
    expect(rule(".snap-pop")).toMatch(/right:\s*0/);
    expect(rule(".snap-pop")).toMatch(/left:\s*auto/);
  });
  it(".pane border and shadow stay inside its own cell", () => {
    const all = rule(".pane") + rule('.pane[data-focused="true"]');
    // no outward (non-inset) shadow or spread ring may paint onto neighbours
    for (const layer of all.match(/box-shadow:[^;]*;/g) ?? [])
      for (const part of layer.replace("box-shadow:", "").split(/,(?![^(]*\))/))
        expect(part.trim()).toMatch(/^inset\b/);
  });
  it(".pane is isolated so effect layers cannot escape", () => {
    expect(rule(".pane")).toMatch(/isolation\s*:\s*isolate/);
  });
});
