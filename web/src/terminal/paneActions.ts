/** Per-pane imperative actions registered by the live terminal. */
const clears = new Map<string, () => void>();

export function registerClear(id: string, fn: () => void): () => void {
  clears.set(id, fn);
  return () => {
    if (clears.get(id) === fn) clears.delete(id);
  };
}

/** Wipe a pane's scrollback (the visible screen stays). */
export function clearScrollback(id: string): boolean {
  const f = clears.get(id);
  f?.();
  return !!f;
}
