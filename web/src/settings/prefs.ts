import { useSyncExternalStore } from "react";

export type PrefName = "serious" | "pet";
const KEY: Record<PrefName, string> = {
  serious: "tdog.serious",
  pet: "tdog.pet",
};
const DEFAULT: Record<PrefName, boolean> = { serious: false, pet: true };
const listeners = new Set<() => void>();

export function getPref(name: PrefName): boolean {
  const v = localStorage.getItem(KEY[name]);
  return v === null ? DEFAULT[name] : v === "1";
}

export function setPref(name: PrefName, on: boolean): void {
  localStorage.setItem(KEY[name], on ? "1" : "0");
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => (
  listeners.add(l),
  () => void listeners.delete(l)
);

/** Persisted boolean preference; updates every subscriber immediately. */
export function usePref(name: PrefName): [boolean, (on: boolean) => void] {
  const v = useSyncExternalStore(subscribe, () => getPref(name));
  return [v, (on) => setPref(name, on)];
}

const MOTIF_KEY = "tdog.motifOpacity";
export const MOTIF_DEFAULT = 6;

/** Terminal motif opacity in percent, 0 (off) to 100; default 6. */
export function getMotifOpacity(): number {
  const n = Number(localStorage.getItem(MOTIF_KEY) ?? MOTIF_DEFAULT);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : MOTIF_DEFAULT;
}

export function setMotifOpacity(pct: number): void {
  localStorage.setItem(MOTIF_KEY, String(pct));
  listeners.forEach((l) => l());
}

export function useMotifOpacity(): [number, (pct: number) => void] {
  const v = useSyncExternalStore(subscribe, getMotifOpacity);
  return [v, setMotifOpacity];
}
