import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = (p: string) =>
  readFileSync(new URL(p, import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

/** Top-level (non-@media) rule bodies whose selector list includes `sel`. */
function baseBodies(src: string, sel: string): string[] {
  const flat = src.replace(/@media[^{]*\{([^{}]*\{[^{}]*\}\s*)*\}/g, "");
  const out: string[] = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1]!.split(",").map((s) => s.trim());
    if (sels.includes(sel)) out.push(m[2]!);
  }
  return out;
}

describe("floating surface css", () => {
  it(".float has the signature values", () => {
    const [b] = baseBodies(css("./index.css"), ".float");
    expect(b).toContain("border: 1.5px solid var(--fg)");
    expect(b).toContain("box-shadow: 3px 3px 0 var(--accent)");
    expect(b).toContain("border-radius: 8px");
  });

  const roots: [string, string][] = [
    [".action-menu", "./components/menu/menu.css"],
    [".menu-submenu", "./components/menu/menu.css"],
    [".dialog", "./overlays/overlays.css"],
    [".cmdk", "./overlays/overlays.css"],
    [".toast", "./overlays/overlays.css"],
    [".pane-overlay-container", "./overlays/pane/overlay.css"],
  ];
  it.each(roots)(
    "%s base rule has no own border/shadow/radius",
    (sel, file) => {
      const bodies = baseBodies(css(file), sel);
      expect(bodies.length).toBeGreaterThan(0);
      for (const b of bodies)
        expect(b).not.toMatch(/box-shadow|border(?!-)|border-radius/);
    },
  );

  it(".tip has no offset shadow", () => {
    const bodies = baseBodies(css("./overlays/overlays.css"), ".tip");
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b).not.toMatch(/box-shadow:\s*(?!none)\S/);
  });

  it("serious mode drops the offset shadow", () => {
    expect(css("./index.css")).toMatch(
      /\[data-serious\] \.float\s*\{[^}]*box-shadow: 0 8px/,
    );
  });

  it("toast kinds set no background fill", () => {
    const src = css("./overlays/overlays.css");
    for (const k of ["success", "fail", "warn", "info"]) {
      const bodies = baseBodies(src, `.toast.${k}`);
      expect(bodies.length).toBeGreaterThan(0);
      for (const b of bodies) expect(b).not.toMatch(/background/);
    }
  });

  it(".icon-btn hover/active rules never transform", () => {
    const src = css("./components/ui/ui.css");
    const rules = [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) =>
      /\.icon-btn[^,{]*:(hover|active)/.test(m[1]!),
    );
    expect(rules.length).toBeGreaterThan(0);
    for (const m of rules) expect(m[2]).not.toMatch(/transform/);
  });
});
