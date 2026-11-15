/** Panes the user opted out of recording; only off panes are stored. */
const REC_KEY = "tdog.paneRecording";
function readRec(): Record<string, false> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(REC_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, false>)
      : {};
  } catch {
    return {};
  }
}
export const paneRecording = (pane: string): boolean =>
  readRec()[pane] !== false;
export function setPaneRecording(pane: string, on: boolean): void {
  const all = readRec();
  if (on) delete all[pane];
  else all[pane] = false;
  try {
    if (Object.keys(all).length)
      localStorage.setItem(REC_KEY, JSON.stringify(all));
    else localStorage.removeItem(REC_KEY);
  } catch {
    /* storage unavailable: the opt-out lasts until reload */
  }
}
