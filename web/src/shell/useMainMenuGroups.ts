import { MODES, type ThemeMode } from "../theme/useThemeMode";
import type { MenuGroup } from "./MainMenu";

/** Main-menu groups (theme, scenes, studio/settings, sign out). */
export function useMainMenuGroups({
  serious,
  setSerious,
  petShown,
  setPetShown,
  mode,
  setMode,
  flows,
  signOut,
  setPicker,
  setStudio,
  setSettings,
}: {
  serious: boolean;
  setSerious: (v: boolean) => void;
  petShown: boolean;
  setPetShown: (v: boolean) => void;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  flows: {
    save: (id?: string) => Promise<unknown> | void;
    saveAs: (id?: string) => Promise<unknown> | void;
  };
  signOut: () => void;
  setPicker: (v: boolean) => void;
  setStudio: (v: boolean) => void;
  setSettings: (v: boolean) => void;
}): MenuGroup[] {
  return [
    [
      // Serious mode forces Plain, so theme choice is hidden.
      ...(serious
        ? []
        : [
            {
              label: "Theme…",
              icon: "system" as const,
              onSelect: () => setPicker(true),
            },
          ]),
      {
        label: "Appearance",
        icon: "light",
        submenu: MODES.map((m) => ({
          label: `${m[0].toUpperCase()}${m.slice(1)}`,
          checked: m === mode,
          onSelect: () => setMode(m),
        })),
      },
      {
        label: "Serious mode",
        icon: "briefcase",
        hint: serious ? "On" : "Off",
        onSelect: () => setSerious(!serious),
      },
      ...(serious
        ? []
        : [
            {
              label: "Dogbert",
              icon: "paw" as const,
              hint: petShown ? "Shown" : "Hidden",
              onSelect: () => setPetShown(!petShown),
            },
          ]),
    ],
    [
      {
        label: "Save scene",
        icon: "server",
        shortcut: "⌘S",
        onSelect: () => void flows.save(),
      },
      {
        label: "Save scene as…",
        icon: "server",
        onSelect: () => void flows.saveAs(),
      },
    ],
    [
      {
        label: "Studio",
        icon: "brush",
        shortcut: "⌘.",
        onSelect: () => setStudio(true),
      },
      {
        label: "Settings",
        icon: "gear",
        shortcut: "⌘,",
        onSelect: () => setSettings(true),
      },
    ],
    [{ label: "Sign out", icon: "signout", onSelect: signOut }],
  ];
}
