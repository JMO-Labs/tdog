import { useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_FX, type FxId, type FxSettings } from "./resolve";

const KEY = "tdog.fx";
const listeners = new Set<() => void>();
let cache: FxSettings | null = null;

function load(): FxSettings {
  try {
    const raw = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Partial<FxSettings> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_FX;
    const i = raw.intensity;
    return {
      master: typeof raw.master === "boolean" ? raw.master : DEFAULT_FX.master,
      intensity:
        typeof i === "number" && i >= 0 && i <= 1 ? i : DEFAULT_FX.intensity,
      on: { ...DEFAULT_FX.on, ...(raw.on ?? {}) },
    };
  } catch {
    return DEFAULT_FX;
  }
}

export const getFx = (): FxSettings => (cache ??= load());

export function setFx(next: FxSettings): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

export const setFxOn = (id: FxId, on: boolean) =>
  setFx({ ...getFx(), on: { ...getFx().on, [id]: on } });

/** Test hook: forget the in-memory copy so the next read hits storage. */
export const resetFxCache = () => {
  cache = null;
};

const subscribe = (l: () => void) => (
  listeners.add(l),
  () => void listeners.delete(l)
);
export const useFx = (): FxSettings => useSyncExternalStore(subscribe, getFx);

const RM = "(prefers-reduced-motion: reduce)";
export function useReducedMotionPref(): boolean {
  const [rm, setRm] = useState(
    () => typeof matchMedia === "function" && matchMedia(RM).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(RM);
    const on = () => setRm(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return rm;
}

export function usePageVisible(): boolean {
  const [v, setV] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const on = () => setV(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return v;
}
