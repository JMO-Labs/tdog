import memphis from "./themes/memphis-pop.json";
import nightMarket from "./themes/night-market.json";
import linkingBook from "./themes/linking-book.json";
import llamaSkin from "./themes/llama-skin.json";
import simGrid from "./themes/sim-grid.json";
import cartridgeBlast from "./themes/cartridge-blast.json";
import slimeTime from "./themes/slime-time.json";
import bayside from "./themes/bayside.json";
import morphSquad from "./themes/morph-squad.json";
import truthIsOutThere from "./themes/truth-is-out-there.json";
import laserBinder from "./themes/laser-binder.json";
import rainbowLeopard from "./themes/rainbow-leopard.json";
import { validateTheme, type ThemeData } from "./schema";

export type Theme = ThemeData & { id: string };
export const DEFAULT_THEME_ID = "memphis-pop";

/** Bundled themes; the default comes first. Invalid data fails loudly at load. */
export const THEMES: Theme[] = Object.entries({
  "memphis-pop": memphis,
  "night-market": nightMarket,
  "linking-book": linkingBook,
  "llama-skin": llamaSkin,
  "sim-grid": simGrid,
  "cartridge-blast": cartridgeBlast,
  "slime-time": slimeTime,
  bayside: bayside,
  "morph-squad": morphSquad,
  "truth-is-out-there": truthIsOutThere,
  "laser-binder": laserBinder,
  "rainbow-leopard": rainbowLeopard,
}).map(([id, raw]) => {
  const r = validateTheme(raw);
  if (!r.ok) throw new Error(`theme ${id}: ${r.error}`);
  return { id, ...r.theme };
});

export const findTheme = (id: string | null | undefined) =>
  THEMES.find((t) => t.id === id);
