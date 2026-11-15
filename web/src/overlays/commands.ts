import type { IconName } from "../shell/icons";

export type Command = {
  id: string;
  title: string;
  shortcut?: string;
  /** Palette section heading (sentence case). */
  group?: string;
  /** Optional leading icon. */
  icon?: IconName;
  /** Five colours shown as a swatch (theme rows). */
  swatch?: string[];
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

/** Positions of the matched characters, [] for an empty query, null if no match. */
export function matchIndices(query: string, text: string): number[] | null {
  const t = text.toLowerCase();
  const out: number[] = [];
  let i = 0;
  for (const ch of query.toLowerCase()) {
    i = t.indexOf(ch, i);
    if (i < 0) return null;
    out.push(i++);
  }
  return out;
}

export const GROUP_ORDER = ["Scenes", "Panes", "Themes", "Account"];
export type Section = { heading: string; items: Command[] };

/** Group commands for display; recents lead when the query is empty. */
export function groupCommands(
  all: Command[],
  query: string,
  recents: string[],
): Section[] {
  const sections: Section[] = [];
  let rest = all.filter((c) => fuzzyMatch(query, c.title));
  if (!query) {
    const byId = new Map(all.map((c) => [c.id, c]));
    const items = recents.flatMap((id) => byId.get(id) ?? []);
    if (items.length) {
      sections.push({ heading: "Recent", items });
      const seen = new Set(items);
      rest = rest.filter((c) => !seen.has(c));
    }
  }
  const headings = [
    ...GROUP_ORDER,
    ...new Set(rest.map((c) => c.group ?? "Other")),
  ];
  for (const heading of new Set(headings)) {
    const items = rest.filter((c) => (c.group ?? "Other") === heading);
    if (items.length) sections.push({ heading, items });
  }
  return sections;
}

const RECENT_KEY = "tdog.recentCommands";
const RECENT_MAX = 5;
export function getRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function recordRecent(id: string) {
  const next = [id, ...getRecents().filter((x) => x !== id)].slice(
    0,
    RECENT_MAX,
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recents are best-effort */
  }
}
