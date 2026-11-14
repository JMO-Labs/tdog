import { CHROME_TOKENS, type Motif, type MotifShape } from "./schema";

const esc = (v: string | number) =>
  String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Hex passes through; a token name becomes a CSS variable so the motif follows the theme. */
const paint = (v: string | undefined) =>
  v === undefined
    ? "none"
    : (CHROME_TOKENS as readonly string[]).includes(v)
      ? `var(--${v})`
      : v;

const GEO: Record<MotifShape["type"], readonly string[]> = {
  path: ["d"],
  circle: ["cx", "cy", "r"],
  rect: ["x", "y", "width", "height"],
  polygon: ["points"],
};

function shapeEl(s: MotifShape): string {
  const geo = GEO[s.type]
    .map(
      (k) =>
        `${k}="${esc((s as unknown as Record<string, string | number>)[k])}"`,
    )
    .join(" ");
  return `<${s.type} ${geo} fill="${esc(paint(s.fill))}" stroke="${esc(paint(s.stroke))}"/>`;
}

/**
 * Build an SVG data URL from structured motif data. Every value is escaped and
 * only allowlisted element names are emitted; theme strings are never markup.
 * Token names resolve to hex via the supplied map (data URLs cannot read CSS vars).
 */
export function motifSvg(
  m: Motif,
  tokens: Record<string, string> = {},
): string {
  const resolve = (s: string) =>
    s.replace(/var\(--([a-z0-9-]+)\)/g, (_, k: string) => tokens[k] ?? "none");
  const body = m.shapes.map(shapeEl).join("");
  const [w, h] = m.tile;
  const svg = resolve(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${m.viewBox.map(esc).join(" ")}">${body}</svg>`,
  );
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
