import { useEffect, useState } from "react";
import { saveLayout, loadLayout } from "../layout/store";
import { addLeaf } from "../layout/transfer";
import { newId, leaves } from "../layout/tree";
import { registerCommand } from "../overlays/commands";
import { useCopy } from "../copy/copy";
import { useToast } from "../overlays/toast";
import { listPresets, putScenePreset, startScene } from "./api";
import { errorMessage, preparePane } from "./launch";
import { runToTree } from "./layout";
import { NameDialog, PresetPicker } from "./PresetPicker";
import { bindSession, panePresets, setScenePreset } from "./panes";
import { sceneToml } from "./toml";

type Pick = { kind: "terminal" | "scene"; names: string[] } | null;

/**
 * ⌘K preset flows: new pane from a terminal preset, open a scene preset in a
 * new tab, save the current scene as a preset. Returns the dialogs to render.
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
  const [naming, setNaming] = useState(false);

  useEffect(() => {
    const choose = async (kind: "terminal" | "scene") => {
      try {
        const names = await listPresets(kind);
        if (names.length) setPick({ kind, names });
        else toast("info", c("preset.none", { kind }));
      } catch (e) {
        toast("fail", errorMessage(e));
      }
    };
    const offs = [
      registerCommand({
        id: "preset:pane",
        title: "New pane from preset…",
        group: "Panes",
        run: () => void choose("terminal"),
      }),
      registerCommand({
        id: "preset:open-scene",
        title: "Open scene preset…",
        group: "Scenes",
        run: () => void choose("scene"),
      }),
      registerCommand({
        id: "preset:save-scene",
        title: "Save scene as preset…",
        group: "Scenes",
        run: () => setNaming(true),
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [toast]);

  const onPick = async (name: string) => {
    const kind = pick?.kind;
    setPick(null);
    if (kind === "terminal") {
      const id = await preparePane(name, toast);
      if (id) addLeaf(scene, id);
    } else if (kind === "scene") {
      try {
        const run = await startScene(name);
        const { tree, sessions } = runToTree(run);
        const tab = newId("sc");
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

  const onSave = async (name: string) => {
    const tree = loadLayout(scene);
    if (!tree || !leaves(tree).length) {
      setNaming(false);
      toast("info", c("preset.nothing"));
      return;
    }
    try {
      await putScenePreset(name, sceneToml(name, tree, panePresets()));
      setNaming(false);
      toast("success", c("preset.saved", { name }));
    } catch (e) {
      toast("fail", errorMessage(e));
    }
  };

  return (
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
        open={naming}
        title="Save scene as preset"
        onSave={(n) => void onSave(n)}
        onClose={() => setNaming(false)}
      />
    </>
  );
}
