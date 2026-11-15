import type { Theme } from "../theme/registry";

export type Appearance = "all" | "dark" | "light";

/** Dark themes are dark by default; light also covers themes with a light variant. */
const hasAppearance = (t: Theme, a: "dark" | "light") =>
  a === "light" ? t.appearance === "light" || !!t.light : t.appearance === a;

/** Themes matching a name search (case-insensitive) and an appearance filter. */
export function filterThemes(
  themes: Theme[],
  query: string,
  appearance: Appearance,
): Theme[] {
  const q = query.trim().toLowerCase();
  return themes.filter(
    (t) =>
      (appearance === "all" || hasAppearance(t, appearance)) &&
      (!q || t.name.toLowerCase().includes(q)),
  );
}

/** A random theme other than `not` (unless it is the only one). */
export function pickRandom(
  themes: Theme[],
  not: string | null,
  rand: () => number,
): Theme | undefined {
  const pool = themes.length > 1 ? themes.filter((t) => t.id !== not) : themes;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Set the top-level `theme` key of a terminal preset's TOML. */
export function setThemeInToml(toml: string, theme: string): string {
  const line = `theme = ${JSON.stringify(theme)}`;
  const lines = toml.split("\n");
  const firstTable = lines.findIndex((l) => l.trim().startsWith("["));
  const end = firstTable < 0 ? lines.length : firstTable;
  const i = lines.slice(0, end).findIndex((l) => /^\s*theme\s*=/.test(l));
  if (i >= 0) {
    lines[i] = line;
    return lines.join("\n");
  }
  const head = lines.slice(0, end).join("\n").replace(/\n+$/, "");
  const tail = lines.slice(end).join("\n");
  return (head ? head + "\n" : "") + line + "\n" + tail;
}
