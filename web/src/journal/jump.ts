import { openFocusedPaneOverlay } from "../overlays/pane/focusedPane";
import { journalDB } from "./db";
import type { Hit } from "./search";
import type { JournalRecord } from "./types";

type Jumper = { scroll(rkey: string): boolean; open(id: string): void };
const jumpers = new Map<string, Jumper>();
let switchScene: ((pane: string) => void) | null = null;
let pending: { pane: string; rkey: string } | null = null;

/** A mounted pane offers scroll-to-record and its overlay opener. */
export function registerPaneJump(pane: string, j: Jumper): () => void {
  jumpers.set(pane, j);
  return () => void (jumpers.get(pane) === j && jumpers.delete(pane));
}
/** The workspace activates the scene holding a pane. */
export function setSceneSwitcher(f: ((pane: string) => void) | null): void {
  switchScene = f;
}
/** Record the "journal-record" overlay should show. */
export const pendingRecord = () => pending;

/** Scroll to the hit's marker, else show the stored record in an overlay. */
export function jumpTo(hit: Hit): "scrolled" | "overlay" {
  const j = jumpers.get(hit.pane);
  if (j) switchScene?.(hit.pane);
  if (j?.scroll(hit.rkey)) return "scrolled";
  pending = { pane: hit.pane, rkey: hit.rkey };
  (j ? j.open : openFocusedPaneOverlay)("journal-record");
  return "overlay";
}

/** One record from the db. ponytail: pane scan; add a keyed get if slow. */
export async function readRecord(
  pane: string,
  rkey: string,
): Promise<JournalRecord | undefined> {
  for await (const r of journalDB()?.records(pane) ?? [])
    if (r.rkey === rkey) return r;
}

const put = (s: string) => navigator.clipboard.writeText(s);
export const copyCommand = (h: Hit) => put(h.cmd);
export const copyOutput = async (h: Hit) =>
  put((await readRecord(h.pane, h.rkey))?.out ?? "");
export const copyBoth = async (h: Hit) =>
  put(`$ ${h.cmd}\n${(await readRecord(h.pane, h.rkey))?.out ?? ""}`);
