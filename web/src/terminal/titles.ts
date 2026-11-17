import { useSyncExternalStore } from "react";

/** What the shell told us about a pane: OSC 0/2 title and OSC 7 cwd. */
export interface PaneInfo {
  title?: string;
  cwd?: string;
  /** Explicit terminal theme (preset or saved scene); unset = page theme. */
  theme?: string;
  /** Where the shell runs, from the server: container, ssh-host or nsenter. */
  target?: string;
}

/** Path from an OSC 7 `file://host/path` URL; undefined if malformed. */
export function cwdFromOsc7(url: string): string | undefined {
  const m = /^file:\/\/[^/]*(\/.*)$/.exec(url);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
}

/** Title shown on a pane: shell title, else cwd, else the target name. */
export function displayTitle(
  info: PaneInfo | undefined,
  fallback: string,
): string {
  return info?.title || info?.cwd || fallback;
}

const infos = new Map<string, PaneInfo>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const titleStore = {
  get: (id: string) => infos.get(id),
  set(id: string, patch: PaneInfo) {
    infos.set(id, { ...infos.get(id), ...patch });
    emit();
  },
  remove(id: string) {
    if (infos.delete(id)) emit();
  },
  clear() {
    infos.clear();
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => void subs.delete(f);
  },
};

/** Reactive title for pane `id`. */
export function usePaneTitle(id: string, fallback: string): string {
  return useSyncExternalStore(titleStore.subscribe, () =>
    displayTitle(titleStore.get(id), fallback),
  );
}

/** Short label for a pane's target; "…" until the server says. */
export function targetLabel(target: string | undefined): string {
  if (!target) return "…";
  return target === "ssh-host" ? "host" : target;
}

/** Reactive target label for pane `id`. */
export function usePaneTarget(id: string | undefined): string {
  return useSyncExternalStore(titleStore.subscribe, () =>
    targetLabel(id ? titleStore.get(id)?.target : undefined),
  );
}
