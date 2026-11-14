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

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(read);

  useEffect(() => themeStore.setScheme(mode), [mode]);

  const cycle = useCallback(() => {
    setMode((m) => {
      const next = MODES[(MODES.indexOf(m) + 1) % MODES.length];
      write(next);
      return next;
    });
  }, []);

  return { mode, cycle };
}
