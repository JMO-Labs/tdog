import { useEffect, useRef, useState } from "react";
import { saveLayout, loadLayout } from "../layout/store";
import { addLeaf } from "../layout/transfer";
import { newId, leaves, titles } from "../layout/tree";
import { registerCommand } from "../overlays/commands";
import { useCopy } from "../copy/copy";
import { useToast } from "../overlays/toast";
import { listPresets, putScenePreset, startScene } from "./api";
import { errorMessage, preparePane } from "./launch";
import { liveInfo } from "./liveInfo";
import { runToTree } from "./layout";
import { NameDialog, PresetPicker } from "./PresetPicker";
import {
  bindSession,
  panePresets,
  scenePreset,
  setPaneTheme,
  setScenePreset,
} from "./panes";
import { applySaved, getSave, putSave, snapshot } from "./sceneSave";
import { sceneToml, type Override } from "./toml";

type Pick = { kind: "terminal" | "scene"; names: string[] } | null;

/**
 * Preset flows (⌘K, tab menu, ⌘S): new pane from a terminal preset, open a
 * saved scene in a new tab, Save / Save as for a scene tab.
 */
export function usePresetFlows({
  scene,
  openTab,
}: {
  /** Active scene id. */
  scene: string;
  /** Add and activate a scene tab. */
  openTab: (id: string, name: string) => void;
}) {
  const toast = useToast();
  const c = useCopy();
  const [pick, setPick] = useState<Pick>(null);
  const [naming, setNaming] = useState<string | null>(null); // scene being saved
  const [existing, setExisting] = useState<string[]>([]);

  const choose = async (kind: "terminal" | "scene") => {
    try {
      const names = await listPresets(kind);
      if (names.length) setPick({ kind, names });
      else toast("info", c("preset.none", { kind }));
    } catch (e) {
      toast("fail", errorMessage(e));
    }
  };

  /** Write scene tab `tab` to preset `name` and link the tab to it. */
  const saveTo = async (tab: string, name: string) => {
    const tree = loadLayout(tab);
    if (!tree || !leaves(tree).length) {
      setNaming(null);
      toast("info", c("preset.nothing"));
      return;
    }
    const custom = titles(tree);
    const overrides: Record<string, Override> = {};
    for (const id of leaves(tree)) {
      const { cwd, theme } = liveInfo(id);
      overrides[id] = { cwd, theme, title: custom[id] };
    }
    try {
      await putScenePreset(
        name,
        sceneToml(name, tree, panePresets(), overrides),
      );
      setScenePreset(tab, name);
      putSave(name, snapshot(tree, liveInfo));
      setNaming(null);
      toast("success", c("preset.saved", { name }));
    } catch (e) {
      toast("fail", errorMessage(e));
    }
  };

  const saveAs = async (tab = scene) => {
    try {
      setExisting(await listPresets("scene"));
    } catch {
      setExisting([]);
    }
    setNaming(tab);
  };
  /** Overwrite the preset the tab came from; without one, act as Save as. */
  const save = async (tab = scene) => {
    const name = scenePreset(tab);
    if (name) await saveTo(tab, name);
    else await saveAs(tab);
  };
  const latest = useRef({ save, saveAs, choose });
  latest.current = { save, saveAs, choose };

  useEffect(() => {
    const offs = [
      registerCommand({
        id: "preset:pane",
        title: "New pane from preset…",
        group: "Panes",
        run: () => void latest.current.choose("terminal"),
      }),
      registerCommand({
        id: "preset:open-scene",
        title: "Open scene preset…",
        group: "Scenes",
        run: () => void latest.current.choose("scene"),
      }),
      registerCommand({
        id: "scene:save",
        title: "Save scene",
        group: "Scenes",
        shortcut: "⌘S",
        run: () => void latest.current.save(),
      }),
      registerCommand({
        id: "preset:save-scene",
        title: "Save scene as…",
        group: "Scenes",
        run: () => void latest.current.saveAs(),
      }),
    ];
    return () => offs.forEach((f) => f());
  }, []);

  const onPick = async (name: string) => {
    const kind = pick?.kind;
    setPick(null);
    if (kind === "terminal") {
      const id = await preparePane(name, toast);
      if (id) addLeaf(scene, id);
    } else if (kind === "scene") {
      try {
        const run = await startScene(name);
        const { sessions, ...started } = runToTree(run);
        let tree = started.tree;
        const tab = newId("sc");
        const saved = getSave(name);
        if (saved) {
          const r = applySaved(saved, tree);
          tree = r.tree;
          for (const [pane, t] of Object.entries(r.themes))
            setPaneTheme(pane, t);
        }
        for (const [pane, s] of Object.entries(sessions)) bindSession(pane, s);
        saveLayout(tab, tree);
        setScenePreset(tab, name);
        openTab(tab, name);
        toast(
          "success",
          c(run.existing ? "preset.attached" : "preset.started", { name }),
        );
      } catch (e) {
        toast("fail", errorMessage(e));
      }
    }
  };

  const dialogs = (
    <>
      <PresetPicker
        open={pick !== null}
        title={
          pick?.kind === "scene" ? "Open scene preset" : "New pane from preset"
        }
        names={pick?.names ?? []}
        onPick={(n) => void onPick(n)}
        onClose={() => setPick(null)}
      />
      <NameDialog
        open={naming !== null}
        title="Save scene as"
        existing={existing}
        onSave={(n) => naming && void saveTo(naming, n)}
        onClose={() => setNaming(null)}
      />
    </>
  );
  return {
    dialogs,
    save,
    saveAs,
    openSaved: () => choose("scene"),
  };
}
