/** Fonts installed on the box (spec §8): served as @font-face by /api/fonts.css. */
let sheet: Promise<void> | null = null;

/** Add the server font stylesheet once; resolves on load or error (fallback stays). */
export function loadServerFonts(): Promise<void> {
  sheet ??= new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/api/fonts.css";
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return sheet;
}

/** Resolves once the stylesheet is in and the face for `family` has loaded. */
export function whenFamilyReady(family: string): Promise<void> {
  return loadServerFonts()
    .then(() => document.fonts?.load(`16px ${family}`))
    .then(
      () => undefined,
      () => undefined,
    );
}
