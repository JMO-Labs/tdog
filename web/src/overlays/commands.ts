export type Command = {
  id: string;
  title: string;
  shortcut?: string;
  run: () => void;
  /** Called while highlighted in the palette (live preview). */
  preview?: () => void;
  /** Called when the highlight leaves or the palette closes. */
  revert?: () => void;
};

const registry = new Map<string, Command>();
const listeners = new Set<() => void>();
let snapshot: Command[] = [];
const emit = () => {
  snapshot = [...registry.values()];
  listeners.forEach((l) => l());
};

/** Register a command; returns an unregister function. */
export function registerCommand(c: Command): () => void {
  registry.set(c.id, c);
  emit();
  return () => {
    if (registry.get(c.id) === c) {
      registry.delete(c.id);
      emit();
    }
  };
}
export function clearCommands() {
  registry.clear();
  emit();
}
export const subscribeCommands = (l: () => void) => (
  listeners.add(l),
  () => void listeners.delete(l)
);
export const getCommands = () => snapshot;

/** Case-insensitive subsequence match. */
export function fuzzyMatch(query: string, text: string): boolean {
  const t = text.toLowerCase();
  let i = 0;
  for (const ch of query.toLowerCase()) {
    i = t.indexOf(ch, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}
