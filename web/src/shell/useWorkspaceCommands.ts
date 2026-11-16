import { useEffect, type MutableRefObject } from "react";
import { registerCommand } from "../overlays/commands";
import { getPref } from "../settings/prefs";
import {
  toggleBroadcast,
  toggleSceneBroadcast,
  getBroadcastGroup,
} from "../broadcast/store";

/** Registers the shell's command-palette entries while mounted. */
export function useWorkspaceCommands({
  cycle,
  signOut,
  add,
  serious,
  setSerious,
  focused,
  active,
  leafMap,
  closeActive,
  setPicker,
  setSettings,
  setStudio,
  setSearch,
}: {
  cycle: () => void;
  signOut: () => void;
  add: () => void;
  serious: boolean;
  setSerious: (v: boolean) => void;
  focused: string | null;
  active: string;
  leafMap: Record<string, string[]>;
  closeActive: MutableRefObject<() => void>;
  setPicker: (v: boolean) => void;
  setSettings: (v: boolean) => void;
  setStudio: (v: boolean) => void;
  setSearch: (v: boolean) => void;
}) {
  useEffect(() => {
    const offs = [
      registerCommand({
        id: "theme",
        icon: "brush",
        title: "Cycle theme",
        group: "Themes",
        shortcut: "⇧⌘L",
        run: cycle,
      }),
      // Serious mode forces Plain, so theme choice is hidden.
      ...(serious
        ? []
        : [
            registerCommand({
              id: "theme:pick",
              icon: "brush",
              title: "Theme…",
              group: "Themes",
              run: () => setPicker(true),
            }),
          ]),
      registerCommand({
        id: "serious",
        icon: "system",
        title: "Serious mode",
        group: "Themes",
        run: () => setSerious(!getPref("serious")),
      }),
      registerCommand({
        id: "settings",
        icon: "gear",
        title: "Open settings",
        group: "Panes",
        shortcut: "⌘,",
        run: () => setSettings(true),
      }),
      registerCommand({
        id: "studio",
        icon: "layout",
        title: "Open Studio",
        group: "Panes",
        shortcut: "⌘.",
        run: () => setStudio(true),
      }),
      registerCommand({
        id: "search:history",
        icon: "search",
        title: "Search history…",
        group: "Panes",
        shortcut: "⇧⌘F",
        run: () => setSearch(true),
      }),
      registerCommand({
        id: "scene:new",
        icon: "plus",
        title: "New scene",
        group: "Scenes",
        shortcut: "⌘T",
        run: add,
      }),
      registerCommand({
        id: "scene:close",
        icon: "close",
        danger: true,
        title: "Close scene",
        group: "Scenes",
        run: () => closeActive.current(),
      }),
      registerCommand({
        id: "signout",
        icon: "signout",
        title: "Sign out",
        group: "Account",
        run: signOut,
      }),
      registerCommand({
        id: "broadcast:toggle",
        icon: "bolt",
        title: "Broadcast this pane",
        group: "Panes",
        run: () => {
          if (focused) toggleBroadcast(active, focused);
        },
      }),
      registerCommand({
        id: "broadcast:all",
        title: "Broadcast to all panes",
        group: "Panes",
        shortcut: "⇧⌘B",
        run: () => toggleSceneBroadcast(active, leafMap[active] ?? []),
      }),
      registerCommand({
        id: "broadcast:stop",
        title: "Stop broadcasting",
        group: "Panes",
        run: () => {
          if (focused && getBroadcastGroup(active).has(focused)) {
            toggleBroadcast(active, focused);
          }
        },
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [cycle, signOut, add, serious, setSerious, focused, active, leafMap]);
}
