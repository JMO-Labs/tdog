import { text, type CopyKey } from "../copy/copy";
import { saveLayout } from "../layout/store";
import { newId } from "../layout/tree";
import { startScene } from "./api";
import { errorMessage, type Toast } from "./launch";
import { runToTree } from "./layout";
import { bindSession, setPaneTheme, setScenePreset } from "./panes";
import { applySaved, getSave } from "./sceneSave";

/** Start scene preset `name` (plus any saved layout) and open it in a new scene tab. */
export async function openScenePreset(
  name: string,
  openTab: (id: string, name: string) => void,
  toast: Toast,
  c: (key: CopyKey, vars?: Record<string, string | number>) => string = (
    k,
    v,
  ) => text(k, false, v),
): Promise<void> {
  try {
    const run = await startScene(name);
    const { sessions, ...started } = runToTree(run);
    let tree = started.tree;
    const tab = newId("sc");
    // A layout saved with "Save scene" wins over the preset's own tree.
    const saved = getSave(name);
    if (saved) {
      const r = applySaved(saved, tree);
      tree = r.tree;
      for (const [pane, t] of Object.entries(r.themes)) setPaneTheme(pane, t);
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
