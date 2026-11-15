import type { FONTS } from "./schema";

type FontId = (typeof FONTS)[number];
const MONO = "monospace";

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
  `"${face(id).family}", ${MONO}`;

const loaded = new Map<string, Promise<void>>();

/** Load a font once; resolves when the face is usable so callers can refit. */
export function loadFont(id: string): Promise<void> {
  const f = face(id);
  let p = loaded.get(f.family);
  if (!p) {
    p = f
      .css()
      .then(() => document.fonts?.load(`16px "${f.family}"`))
      .then(
        () => undefined,
        () => undefined, // font failure keeps the fallback family
      );
    loaded.set(f.family, p);
  }
  return p;
}
