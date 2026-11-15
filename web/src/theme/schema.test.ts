import { describe, expect, it } from "vitest";
import { contrast, validateTheme } from "./schema";
import { motifSvg } from "./motif";
import { THEMES } from "./registry";

// Raw theme data: strip the registry-added `id`, which is not part of the format.
const ok = () => {
  const raw = JSON.parse(JSON.stringify(THEMES[0]));
  delete raw.id;
  return raw;
};

describe("validateTheme", () => {
  it("accepts a good theme", () => {
    expect(validateTheme(ok()).ok).toBe(true);
  });
  it("rejects unknown keys at every level", () => {
    for (const mutate of [
      (t: any) => (t.css = "body{}"),
      (t: any) => (t.terminal.extra = "#000000"),
      (t: any) => (t.terminal.palette.extra = "#000000"),
      (t: any) => (t.chrome.shape.extra = 1),
      (t: any) => (t.chrome.tokens.nope = "#000000"),
    ]) {
      const t = ok();
      mutate(t);
      expect(validateTheme(t).ok).toBe(false);
    }
  });
  it("rejects non-hex colors", () => {
    for (const bad of ["red", "#12", "#gggggg", "rgb(0,0,0)", "url(x)", 5]) {
      const t = ok();
      t.terminal.palette.fg = bad;
      expect(validateTheme(t).ok).toBe(false);
    }
    const t = ok();
    t.chrome.tokens.bg = "expression(1)";
    expect(validateTheme(t).ok).toBe(false);
  });
  it("requires 16 ANSI colors, valid appearance and pattern", () => {
    let t = ok();
    t.terminal.palette.ansi = t.terminal.palette.ansi.slice(1);
    expect(validateTheme(t).ok).toBe(false);
    t = ok();
    t.appearance = "sepia";
    expect(validateTheme(t).ok).toBe(false);
    t = ok();
    t.chrome.pattern = "evil";
    expect(validateTheme(t).ok).toBe(false);
    expect(validateTheme(null).ok).toBe(false);
  });
  it("validates the optional light variant", () => {
    const t = ok();
    t.light = {
      terminal: { palette: { ...t.terminal.palette, bg: "nope" } },
      chrome: { tokens: {} },
    };
    expect(validateTheme(t).ok).toBe(false);
  });
});

describe("bundled themes", () => {
  it("has unique ids and memphis-pop first", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("memphis-pop");
  });
  it("ships the 90s theme pack 3", () => {
    const ids = THEMES.map((t) => t.id);
    for (const id of [
      "dial-up-paranoia",
      "black-box",
      "virtual-mind",
      "multipass",
      "bug-hunt",
    ])
      expect(ids).toContain(id);
  });
  it("bundles the 90s pack 2 themes with an inspired-by line", () => {
    for (const id of [
      "wetwired",
      "sewer-squad",
      "wake-up-neo",
      "section-9",
      "mainframe",
    ]) {
      const t = THEMES.find((x) => x.id === id);
      expect(t, id).toBeDefined();
      expect(t!.description).toMatch(/inspired by/i);
    }
  });
  it("bundles the 90s pack 5", () => {
    const ids = THEMES.map((t) => t.id);
    for (const id of [
      "linking-book",
      "llama-skin",
      "sim-grid",
      "cartridge-blast",
      "slime-time",
    ])
      expect(ids).toContain(id);
    expect(THEMES.find((t) => t.id === "linking-book")?.light).toBeDefined();
    expect(THEMES.find((t) => t.id === "slime-time")?.chrome.pattern).toBe(
      "confetti",
    );
  });
  it("ships the 90s pack 1", () => {
    const by = (id: string) => THEMES.find((t) => t.id === id)!;
    for (const id of [
      "colonial-marine",
      "liquid-metal",
      "ninety-five",
      "hack-the-planet",
      "isla-nublar",
    ]) {
      expect(by(id), id).toBeTruthy();
      expect(by(id).description).toMatch(/inspired by/i);
    }
    expect(by("ninety-five").light).toBeTruthy();
    expect(by("hack-the-planet").chrome.pattern).toBe("zigzag");
  });

  it("ships a light variant for every theme in the light-variants set", () => {
    for (const id of [
      "liquid-metal",
      "llama-skin",
      "mainframe",
      "morph-squad",
      "multipass",
    ])
      expect(THEMES.find((t) => t.id === id)?.light, id).toBeDefined();
  });
  it("ships a light variant for the dark-only themes", () => {
    for (const id of [
      "deep-gravity",
      "dial-up-paranoia",
      "hack-the-planet",
      "isla-nublar",
      "laser-binder",
      "ack-ack",
      "black-box",
      "bug-hunt",
      "cartridge-blast",
      "colonial-marine",
    ])
      expect(THEMES.find((t) => t.id === id)?.light, id).toBeDefined();
  });
  it("ships a light variant for every dual-appearance theme", () => {
    for (const id of [
      "slime-time",
      "truth-is-out-there",
      "virtual-mind",
      "wake-up-neo",
      "wetwired",
    ])
      expect(THEMES.find((t) => t.id === id)?.light, id).toBeDefined();
  });
  it("ships a light variant for the dark-only pack", () => {
    for (const id of [
      "night-market",
      "rip-and-tear",
      "section-9",
      "sewer-squad",
      "sim-grid",
    ])
      expect(THEMES.find((t) => t.id === id)?.light, id).toBeDefined();
  });
  it("every bundled theme ships both appearances", () => {
    const missing = THEMES.filter((t) => !t.light).map((t) => t.id);
    expect(missing).toEqual([]);
  });
  for (const t of THEMES) {
    describe(t.id, () => {
      it("is schema valid", () => {
        const { id, ...data } = t;
        expect(id).toBeTruthy();
        expect(validateTheme(data)).toEqual({ ok: true, theme: data });
      });
      for (const [label, term] of [
        ["base", t.terminal.palette],
        ...(t.light ? [["light", t.light.terminal.palette] as const] : []),
      ] as const) {
        it(`${label}: fg/bg contrast >= 4.5`, () => {
          expect(contrast(term.fg, term.bg)).toBeGreaterThanOrEqual(4.5);
        });
        it(`${label}: every ANSI color >= 3:1 on bg`, () => {
          term.ansi.forEach((c, i) =>
            expect(
              contrast(c, term.bg),
              `ansi ${i} ${c}`,
            ).toBeGreaterThanOrEqual(3),
          );
        });
      }
    });
  }
});

describe("theme format v2", () => {
  const bad = (mutate: (t: any) => void) => {
    const t = ok();
    mutate(t);
    return validateTheme(t).ok;
  };
  it("rejects non-allowlisted ids", () => {
    expect(bad((t) => (t.terminal.font = "Comic Sans"))).toBe(false);
    expect(bad((t) => (t.terminal.font = 5))).toBe(false);
    expect(
      bad((t) => (t.terminal.effects = [{ id: "evil", intensity: 1 }])),
    ).toBe(false);
    expect(bad((t) => (t.chrome.boot = "evil"))).toBe(false);
    expect(bad((t) => (t.chrome.costume = "evil"))).toBe(false);
    expect(bad((t) => (t.chrome.costume = { name: "hat", rows: ["#x"] }))).toBe(
      false,
    );
    expect(bad((t) => (t.chrome.costume = { name: "hat", rows: [] }))).toBe(
      false,
    );
    expect(bad((t) => (t.chrome.costume = { name: "", rows: ["#"] }))).toBe(
      false,
    );
    expect(
      bad((t) => (t.chrome.costume = { name: "hat", rows: ["#"], x: 1 })),
    ).toBe(false);
    expect(bad((t) => (t.chrome.shape.shadow = "url(x)"))).toBe(false);
    expect(bad((t) => (t.terminal.cursor.shape = "star"))).toBe(false);
  });
  it("accepts a costume", () => {
    expect(
      bad(
        (t) =>
          (t.chrome.costume = {
            name: "safari hat",
            rows: ["..##..", "######"],
          }),
      ),
    ).toBe(true);
  });
  it("range-checks numbers", () => {
    expect(
      bad((t) => (t.terminal.effects = [{ id: "scanlines", intensity: 1.5 }])),
    ).toBe(false);
    expect(
      bad((t) => (t.terminal.effects = [{ id: "scanlines", intensity: 0.5 }])),
    ).toBe(true);
    expect(bad((t) => (t.chrome.shape.radius = 2))).toBe(false);
    expect(bad((t) => (t.chrome.shape.border = 4))).toBe(false);
    expect(bad((t) => (t.terminal.cursor.blink = "yes"))).toBe(false);
  });
  it("rejects v1 flat shape and raw svg strings", () => {
    expect(bad((t) => (t.pattern = "none"))).toBe(false);
    expect(bad((t) => (t.terminal.motif = "<svg onload=x>"))).toBe(false);
  });
  it("accepts fill/stroke none on motif shapes", () => {
    const motif = {
      viewBox: [0, 0, 20, 20],
      tile: [20, 20],
      shapes: [
        { type: "circle", cx: 5, cy: 5, r: 3, fill: "none", stroke: "#fff" },
      ],
    };
    expect(bad((t) => (t.chrome.motif = motif))).toBe(true);
  });

  it("accepts a structured motif and rejects bad shapes", () => {
    const motif = {
      viewBox: [0, 0, 20, 20],
      tile: [20, 20],
      shapes: [
        { type: "circle", cx: 5, cy: 5, r: 3, fill: "#ff00aa" },
        { type: "rect", x: 0, y: 0, width: 4, height: 4, stroke: "pink" },
        { type: "path", d: "M0 0L10 10", stroke: "#fff" },
        { type: "polygon", points: "0,0 5,5 0,5", fill: "cyan" },
      ],
    };
    expect(bad((t) => (t.chrome.motif = motif))).toBe(true);
    expect(bad((t) => (t.terminal.motif = motif))).toBe(true);
    const m = (shape: object) => ({ ...motif, shapes: [shape] });
    expect(bad((t) => (t.chrome.motif = m({ type: "image", href: "x" })))).toBe(
      false,
    );
    expect(
      bad(
        (t) =>
          (t.chrome.motif = m({
            type: "circle",
            cx: 1,
            cy: 1,
            r: 1,
            fill: "url(#x)",
          })),
      ),
    ).toBe(false);
    expect(
      bad(
        (t) =>
          (t.chrome.motif = m({
            type: "circle",
            cx: 1,
            cy: 1,
            r: 1,
            fill: "nope",
          })),
      ),
    ).toBe(false);
    expect(
      bad(
        (t) =>
          (t.chrome.motif = m({ type: "path", d: "<script>", fill: "#fff" })),
      ),
    ).toBe(false);
    expect(
      bad(
        (t) =>
          (t.chrome.motif = m({
            type: "circle",
            cx: 1,
            cy: 1,
            r: 1,
            onclick: "x",
          })),
      ),
    ).toBe(false);
    expect(bad((t) => (t.chrome.motif = { ...motif, extra: 1 }))).toBe(false);
  });
});

describe("motifSvg", () => {
  it("builds an svg data url from structured data only", () => {
    const url = motifSvg({
      viewBox: [0, 0, 10, 10],
      tile: [10, 10],
      shapes: [{ type: "circle", cx: 5, cy: 5, r: 2, fill: "#ff0000" }],
    });
    const svg = decodeURIComponent(url.replace(/^data:image\/svg\+xml,/, ""));
    expect(svg).toContain('<circle cx="5" cy="5" r="2" fill="#ff0000"');
    expect(svg.startsWith("<svg")).toBe(true);
  });
  it("resolves a token-name fill to its hex value", () => {
    const svg = decodeURIComponent(
      motifSvg(
        {
          viewBox: [0, 0, 10, 10],
          tile: [10, 10],
          shapes: [{ type: "circle", cx: 5, cy: 5, r: 2, fill: "pink" }],
        },
        { pink: "#ff2d95" },
      ).replace(/^data:image\/svg\+xml,/, ""),
    );
    expect(svg).toContain('fill="#ff2d95"');
  });
  it("escapes attribute values", () => {
    const svg = decodeURIComponent(
      motifSvg({
        viewBox: [0, 0, 1, 1],
        tile: [1, 1],
        shapes: [{ type: "path", d: 'M0 0"onload="x', fill: "#fff" }],
      }).replace(/^data:image\/svg\+xml,/, ""),
    );
    expect(svg).not.toContain('"onload="');
  });
});

describe("90s theme pack 4", () => {
  const byId = (id: string) => THEMES.find((t) => t.id === id)!;
  const ids = [
    "mission-control",
    "deep-gravity",
    "ack-ack",
    "pocket-monochrome",
    "rip-and-tear",
  ];
  it("registers all five with an inspired-by description", () => {
    for (const id of ids) {
      expect(byId(id), id).toBeDefined();
      expect(byId(id).description).toMatch(/inspired by/i);
    }
  });
  it("Mission Control ships a light variant", () => {
    expect(byId("mission-control").light).toBeDefined();
  });
  it("Pocket Monochrome uses exactly 4 greens and ships a light variant", () => {
    const t = byId("pocket-monochrome");
    expect(t.light).toBeDefined();
    const used = new Set<string>();
    for (const v of [t, t.light!])
      for (const c of [
        v.terminal.palette.fg,
        v.terminal.palette.bg,
        v.terminal.palette.cursor,
        v.terminal.palette.selection,
        ...v.terminal.palette.ansi,
        ...Object.values(v.chrome.tokens),
      ])
        used.add(c.toLowerCase());
    expect(used.size).toBe(4);
  });
});

describe("theme schema error branches", () => {
  const bad = (mutate: (t: any) => void) => {
    const t = ok();
    mutate(t);
    return validateTheme(t).ok;
  };
  const motif = {
    viewBox: [0, 0, 20, 20],
    tile: [20, 20],
    shapes: [],
  };
  it("rejects malformed motif geometry", () => {
    expect(
      bad((t) => (t.chrome.motif = { ...motif, viewBox: [0, 0, 20] })),
    ).toBe(false);
    expect(
      bad((t) => (t.chrome.motif = { ...motif, viewBox: [0, 0, 0, 20] })),
    ).toBe(false);
    expect(bad((t) => (t.chrome.motif = { ...motif, tile: [0, 20] }))).toBe(
      false,
    );
    expect(bad((t) => (t.chrome.motif = { ...motif, shapes: "nope" }))).toBe(
      false,
    );
    expect(
      bad(
        (t) =>
          (t.chrome.motif = {
            ...motif,
            shapes: Array.from({ length: 65 }, () => ({
              type: "circle",
              cx: 1,
              cy: 1,
              r: 1,
            })),
          }),
      ),
    ).toBe(false);
  });
  it("rejects malformed cursor and effects lists", () => {
    expect(bad((t) => (t.terminal.cursor = "block"))).toBe(false);
    expect(bad((t) => (t.terminal.cursor.extra = 1))).toBe(false);
    expect(bad((t) => (t.terminal.effects = "none"))).toBe(false);
    expect(
      bad(
        (t) =>
          (t.terminal.effects = Array.from({ length: 9 }, () => ({
            id: "scanlines",
            intensity: 0.5,
          }))),
      ),
    ).toBe(false);
  });
  it("rejects malformed light variants", () => {
    const light = (over: object) => {
      const t = ok();
      return {
        ...t,
        light: {
          terminal: { palette: t.terminal.palette },
          chrome: { tokens: {} },
          ...over,
        },
      };
    };
    expect(validateTheme(light({})).ok).toBe(true);
    expect(validateTheme(light({ extra: 1 })).ok).toBe(false);
    expect(validateTheme({ ...ok(), light: "x" }).ok).toBe(false);
    expect(validateTheme(light({ terminal: { palette: {}, x: 1 } })).ok).toBe(
      false,
    );
    expect(validateTheme(light({ terminal: null })).ok).toBe(false);
    expect(validateTheme(light({ chrome: { tokens: {}, x: 1 } })).ok).toBe(
      false,
    );
    expect(validateTheme(light({ chrome: null })).ok).toBe(false);
  });
});
