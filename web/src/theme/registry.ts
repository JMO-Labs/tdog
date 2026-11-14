import memphis from "./themes/memphis-pop.json";
import nightMarket from "./themes/night-market.json";
import wetwired from "./themes/wetwired.json";
import sewerSquad from "./themes/sewer-squad.json";
import wakeUpNeo from "./themes/wake-up-neo.json";
import sectionNine from "./themes/section-9.json";
import mainframe from "./themes/mainframe.json";
import linkingBook from "./themes/linking-book.json";
import llamaSkin from "./themes/llama-skin.json";
import simGrid from "./themes/sim-grid.json";
import cartridgeBlast from "./themes/cartridge-blast.json";
import slimeTime from "./themes/slime-time.json";
import { validateTheme, type ThemeData } from "./schema";

export type Theme = ThemeData & { id: string };
export const DEFAULT_THEME_ID = "memphis-pop";

/** Bundled themes; the default comes first. Invalid data fails loudly at load. */
export const THEMES: Theme[] = Object.entries({
  "memphis-pop": memphis,
  "night-market": nightMarket,
  wetwired: wetwired,
  "sewer-squad": sewerSquad,
  "wake-up-neo": wakeUpNeo,
  "section-9": sectionNine,
  mainframe: mainframe,
  "linking-book": linkingBook,
  "llama-skin": llamaSkin,
  "sim-grid": simGrid,
  "cartridge-blast": cartridgeBlast,
  "slime-time": slimeTime,
}).map(([id, raw]) => {
  const r = validateTheme(raw);
  if (!r.ok) throw new Error(`theme ${id}: ${r.error}`);
  return { id, ...r.theme };
});

export const findTheme = (id: string | null | undefined) =>
  THEMES.find((t) => t.id === id);
