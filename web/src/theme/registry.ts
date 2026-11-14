import memphis from "./themes/memphis-pop.json";
import nightMarket from "./themes/night-market.json";
import { validateTheme, type ThemeData } from "./schema";

export type Theme = ThemeData & { id: string };
export const DEFAULT_THEME_ID = "memphis-pop";

/** Bundled themes; the default comes first. Invalid data fails loudly at load. */
export const THEMES: Theme[] = Object.entries({
  "memphis-pop": memphis,
  "night-market": nightMarket,
}).map(([id, raw]) => {
  const r = validateTheme(raw);
  if (!r.ok) throw new Error(`theme ${id}: ${r.error}`);
  return { id, ...r.theme };
});

export const findTheme = (id: string | null | undefined) =>
  THEMES.find((t) => t.id === id);
