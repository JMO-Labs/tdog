import { useEffect } from "react";

/**
 * Hook for workspace keyboard shortcuts.
 */
export function useKeyboardShortcuts(
  add: () => void,
  select: (id: string) => void,
  sceneIds: string[],
  flows: { save: () => Promise<void> },
  setSettings: (v: boolean) => void,
  setStudio: (v: boolean) => void,
  setMenu: (v: (o: boolean) => boolean) => void,
  setKill: (v: string | null) => void,
  broadcastAll: () => void,
  setSearch: (v: boolean) => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void flows.save();
      } else if (e.key === ",") {
        e.preventDefault();
        setSettings(true);
      } else if (e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setMenu((o) => !o);
      } else if (e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        broadcastAll();
      } else if (e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearch(true);
      } else if (e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setKill("all");
      } else if (e.key === "." && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setStudio(true);
      } else if (e.key === "t" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        add();
      } else if (/^[1-9]$/.test(e.key) && !e.shiftKey && !e.altKey) {
        const target = sceneIds[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          select(target);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    add,
    select,
    sceneIds,
    flows,
    setSettings,
    setStudio,
    setMenu,
    setKill,
    broadcastAll,
    setSearch,
  ]);
}
