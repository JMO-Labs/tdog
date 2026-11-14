import { describe, expect, it } from "vitest";
import { clearMotifCache, motifCacheSize, motifSvg } from "./motif";
import type { Motif } from "./schema";

const decode = (u: string) =>
  decodeURIComponent(u.replace("data:image/svg+xml,", ""));
const motif = (shapes: Motif["shapes"]): Motif => ({
  viewBox: [0, 0, 20, 20],
  tile: [20, 20],
  shapes,
});

describe("motifSvg", () => {
  it.each([
    [{ type: "path", d: "M0 0L5 5", stroke: "#fff" }, '<path d="M0 0L5 5"'],
    [{ type: "circle", cx: 1, cy: 2, r: 3, fill: "#000" }, '<circle cx="1"'],
    [{ type: "rect", x: 1, y: 2, width: 3, height: 4 }, '<rect x="1"'],
    [
      { type: "polygon", points: "0,0 4,0 2,4" },
      '<polygon points="0,0 4,0 2,4"',
    ],
  ] as const)("renders %j", (shape, expected) => {
    const svg = decode(motifSvg(motif([shape as never])));
    expect(svg).toContain(expected);
    expect(svg).toContain('width="20"');
  });

  it("escapes attribute values", () => {
    const svg = decode(
      motifSvg(motif([{ type: "path", d: 'M0 0"/><script>x</script>' }])),
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&#34;");
  });

  it("resolves token names to theme colours", () => {
    const svg = decode(
      motifSvg(motif([{ type: "circle", cx: 1, cy: 1, r: 1, fill: "pink" }]), {
        pink: "#ff2d95",
      }),
    );
    expect(svg).toContain('fill="#ff2d95"');
  });

  it("memoises per motif and token set", () => {
    const m = motif([{ type: "rect", x: 0, y: 0, width: 1, height: 1 }]);
    clearMotifCache();
    motifSvg(m, { pink: "#111" });
    expect(motifCacheSize()).toBe(1);
    motifSvg(m, { pink: "#111" });
    expect(motifCacheSize()).toBe(1);
    motifSvg(m, { pink: "#222" });
    expect(motifCacheSize()).toBe(2);
    expect(motifSvg(m, { pink: "#111" })).not.toBe(
      motifSvg({ ...m, tile: [30, 30] }, { pink: "#111" }),
    );
  });
});
