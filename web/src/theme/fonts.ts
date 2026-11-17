import type { FONTS } from "./schema";

type FontId = (typeof FONTS)[number];
const MONO = "monospace";
/** Breathing room for terminal text; xterm's defaults (0, 1.0) feel cramped. */
export const SPACING = { letterSpacing: 0.5, lineHeight: 1.15 };
/** A font the user picked (e.g. a Nerd Font) keeps its own metrics. */
export const NATIVE_SPACING = { letterSpacing: 0, lineHeight: 1 };
export type Spacing = typeof SPACING;
/** Full Nerd Font symbol set (index.css): icons in shell prompts render in every face. */
const NERD = "Nerd Symbols";

interface Face {
  family: string;
  /** Lazy stylesheet import: the font is fetched only when a pane asks for it. */
  css: () => Promise<unknown>;
}

const FACES: Record<FontId, Face> = {
  "jetbrains-mono": {
    family: "JetBrains Mono",
    css: () => import("@fontsource/jetbrains-mono/400.css"),
  },
  "courier-prime": {
    family: "Courier Prime",
    css: () => import("@fontsource/courier-prime/400.css"),
  },
  vt323: { family: "VT323", css: () => import("@fontsource/vt323/400.css") },
  "press-start-2p": {
    family: "Press Start 2P",
    css: () => import("@fontsource/press-start-2p/400.css"),
  },
  "share-tech-mono": {
    family: "Share Tech Mono",
    css: () => import("@fontsource/share-tech-mono/400.css"),
  },
  "ibm-plex-mono": {
    family: "IBM Plex Mono",
    css: () => import("@fontsource/ibm-plex-mono/400.css"),
  },
  "space-mono": {
    family: "Space Mono",
    css: () => import("@fontsource/space-mono/400.css"),
  },
};

const DEFAULT: FontId = "jetbrains-mono";
const face = (id: string): Face => FACES[id as FontId] ?? FACES[DEFAULT];

/** CSS font-family for a theme font id (unknown ids fall back to the default). */
export const fontFamily = (id: string): string =>
  `"${face(id).family}", "${NERD}", ${MONO}`;

const loaded = new Map<string, Promise<void>>();

/** Load a font once; resolves when the face is usable so callers can refit. */
export function loadFont(id: string): Promise<void> {
  const f = face(id);
  let p = loaded.get(f.family);
  if (!p) {
    p = f
      .css()
      .then(() =>
        Promise.all([
          document.fonts?.load(`16px "${f.family}"`),
          // ponytail: always fetched (~1.2 MB, cached) so the glyph atlas never caches tofu
          document.fonts?.load(`16px "${NERD}"`, "\ue0b0"),
        ]),
      )
      .then(
        () => undefined,
        () => undefined, // font failure keeps the fallback family
      );
    loaded.set(f.family, p);
  }
  return p;
}

/** xterm's default font size, used when the user has not chosen one. */
const DEFAULT_SIZE = 15;

/**
 * Per-font size multiplier so every face reads about as big as the default.
 * ponytail: measured, not guessed. From each bundled @fontsource woff (latin
 * 400): OS/2 sxHeight and the modal hmtx advance, both per em, vs JetBrains Mono
 * (x-height 0.550, advance 0.600). Scale = mean of the x-height ratio and the
 * advance ratio (x-height alone over-widens Courier Prime). Rounded to 0.01.
 *   courier-prime  xh .451 adv .600 -> (1.22 + 1.00) / 2 = 1.11
 *   share-tech     xh .500 adv .540 -> (1.10 + 1.11) / 2 = 1.10
 *   space-mono     xh .496 adv .612 -> (1.11 + 0.98) / 2 = 1.04
 *   ibm-plex-mono  xh .516 adv .600 -> (1.07 + 1.00) / 2 = 1.03
 * Re-measure when adding a font; vt323 / press-start-2p are no longer used for terminals.
 */
const SCALE: Partial<Record<FontId, number>> = {
  "courier-prime": 1.11,
  "share-tech-mono": 1.1,
  "space-mono": 1.04,
  "ibm-plex-mono": 1.03,
};

export const fontScale = (id: string): number => SCALE[id as FontId] ?? 1;

/** Terminal font size for a theme font id; whole px, as restty may not take fractions. */
export const scaledSize = (id: string, size = DEFAULT_SIZE): number =>
  Math.round(size * fontScale(id));
