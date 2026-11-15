import { newId } from "../layout/tree";
import type { ToastKind } from "../overlays/toast";
import { PresetError, resolvePreset } from "./api";
import { setPanePreset } from "./panes";

export type Toast = (kind: ToastKind, detail: string) => void;

export const errorMessage = (e: unknown): string =>
  e instanceof PresetError || e instanceof Error
    ? e.message
    : "Something went wrong.";

/**
 * Validate terminal preset `name` on the server and bind it to a new pane id.
 * A rejected preset toasts the server's message (it names the field) and
 * returns null.
 */
export async function preparePane(
  name: string,
  toast: Toast,
): Promise<string | null> {
  try {
    await resolvePreset(name);
  } catch (e) {
    toast("fail", errorMessage(e));
    return null;
  }
  const id = newId("p");
  setPanePreset(id, name);
  return id;
}
