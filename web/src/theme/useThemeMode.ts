import { themeStore } from "./store";
import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
export const MODES: readonly ThemeMode[] = ["system", "light", "dark"];
const KEY = "tdog.theme";

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return MODES.includes(v as ThemeMode) ? (v as ThemeMode) : "system";
  } catch {
    return "system";
  }
}

function write(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // storage unavailable: mode still applies for this session
  }
}

// Every hook instance (header, settings drawer) follows the same mode.
const peers = new Set<(m: ThemeMode) => void>();

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(read);

  useEffect(() => themeStore.setScheme(mode), [mode]);
  useEffect(() => {
    peers.add(setMode);
    return () => void peers.delete(setMode);
  }, []);

  const set = useCallback((next: ThemeMode) => {
    write(next);
    peers.forEach((p) => p(next));
  }, []);

  const cycle = useCallback(() => {
    set(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  }, [mode, set]);

  return { mode, cycle, set };
}
