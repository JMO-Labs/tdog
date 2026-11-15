/** Panes whose shell the user killed; persists so reload does not respawn. */
const KEY = "tdog.killedPanes";
const subs = new Set<() => void>();

function read(): Record<string, true> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, true>)
      : {};
  } catch {
    return {};
  }
}

function write(m: Record<string, true>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable: the mark lasts until reload */
  }
  subs.forEach((f) => f());
}

export const isKilled = (pane: string): boolean => read()[pane] === true;
export const markKilled = (pane: string): void =>
  write({ ...read(), [pane]: true });
export function clearKilled(pane: string): void {
  const { [pane]: _, ...rest } = read();
  write(rest);
}
export function subscribeKilled(f: () => void): () => void {
  subs.add(f);
  return () => void subs.delete(f);
}
