import { text, type CopyKey } from "../copy/copy";
import { saveLayout } from "../layout/store";
import { newId } from "../layout/tree";
import { startScene } from "./api";
import { errorMessage, type Toast } from "./launch";
import { runToTree } from "./layout";
import { bindSession, setScenePreset } from "./panes";

/** Start scene preset `name` and open it in a new scene tab. */
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
