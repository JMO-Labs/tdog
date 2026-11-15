import { useEffect, useRef } from "react";
import { registerCommand } from "../overlays/commands";

export type PaneCommandActions = {
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  diff: () => void;
  showScreen: () => void;
  kill: () => void;
};

/** Palette twins of the terminal right-click menu, for the focused pane only. */
export function usePaneCommands(focused: boolean, a: PaneCommandActions) {
  const live = useRef(a);
  live.current = a;
  useEffect(() => {
    if (!focused) return;
    const cmd = (
      key: string,
      title: string,
      run: () => void,
      icon?: "copy" | "paste" | "power",
      danger?: boolean,
    ) =>
      registerCommand({
        id: `pane:${key}`,
        title,
        group: "This pane",
        icon,
        danger,
        run,
      });
    const offs = [
      cmd("copy", "Copy", () => live.current.copy(), "copy"),
      cmd("paste", "Paste", () => live.current.paste(), "paste"),
      cmd("select-all", "Select all", () => live.current.selectAll()),
      cmd("diff", "Diff files…", () => live.current.diff()),
      cmd("show-screen", "Show screen text", () => live.current.showScreen()),
      cmd("kill", "Kill shell", () => live.current.kill(), "power", true),
    ];
    return () => offs.forEach((f) => f());
  }, [focused]);
}
