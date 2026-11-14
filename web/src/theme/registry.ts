import memphis from "./themes/memphis-pop.json";
import nightMarket from "./themes/night-market.json";
import dialUpParanoia from "./themes/dial-up-paranoia.json";
import blackBox from "./themes/black-box.json";
import virtualMind from "./themes/virtual-mind.json";
import multipass from "./themes/multipass.json";
import bugHunt from "./themes/bug-hunt.json";
import { validateTheme, type ThemeData } from "./schema";

export type Theme = ThemeData & { id: string };
export const DEFAULT_THEME_ID = "memphis-pop";

/** Bundled themes; the default comes first. Invalid data fails loudly at load. */
export const THEMES: Theme[] = Object.entries({
  "memphis-pop": memphis,
  "night-market": nightMarket,
  "dial-up-paranoia": dialUpParanoia,
  "black-box": blackBox,
  "virtual-mind": virtualMind,
  multipass: multipass,
  "bug-hunt": bugHunt,
}).map(([id, raw]) => {
  const r = validateTheme(raw);
  if (!r.ok) throw new Error(`theme ${id}: ${r.error}`);
  return { id, ...r.theme };
});

export const findTheme = (id: string | null | undefined) =>
  THEMES.find((t) => t.id === id);
