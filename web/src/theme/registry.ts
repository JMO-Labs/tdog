import memphis from "./themes/memphis-pop.json";
import nightMarket from "./themes/night-market.json";
import dialUpParanoia from "./themes/dial-up-paranoia.json";
import blackBox from "./themes/black-box.json";
import virtualMind from "./themes/virtual-mind.json";
import multipass from "./themes/multipass.json";
import bugHunt from "./themes/bug-hunt.json";
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
import missionControl from "./themes/mission-control.json";
import deepGravity from "./themes/deep-gravity.json";
import ackAck from "./themes/ack-ack.json";
import pocketMonochrome from "./themes/pocket-monochrome.json";
import ripAndTear from "./themes/rip-and-tear.json";
import colonialMarine from "./themes/colonial-marine.json";
import liquidMetal from "./themes/liquid-metal.json";
import ninetyFive from "./themes/ninety-five.json";
import hackThePlanet from "./themes/hack-the-planet.json";
import islaNublar from "./themes/isla-nublar.json";
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
  "mission-control": missionControl,
  "deep-gravity": deepGravity,
  "ack-ack": ackAck,
  "pocket-monochrome": pocketMonochrome,
  "rip-and-tear": ripAndTear,
  "colonial-marine": colonialMarine,
  "liquid-metal": liquidMetal,
  "ninety-five": ninetyFive,
  "hack-the-planet": hackThePlanet,
  "isla-nublar": islaNublar,
}).map(([id, raw]) => {
  const r = validateTheme(raw);
  if (!r.ok) throw new Error(`theme ${id}: ${r.error}`);
  return { id, ...r.theme };
});

export const findTheme = (id: string | null | undefined) =>
  THEMES.find((t) => t.id === id);
