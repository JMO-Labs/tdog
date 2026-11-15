import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { TerminalMenu } from "./TerminalMenu";
import type { TerminalRenderer } from "./renderer";
import { usePref } from "../settings/prefs";
import { THEMES } from "../theme/registry";
import { clearScrollback } from "./paneActions";
import { killScene } from "./sessions";
import {
  paneRecording,
  setPaneRecording,
  setPaneTheme,
} from "../presets/panes";
import { journalDB } from "../journal/db";
import { useToast } from "../overlays/toast";
import type { TerminalSession } from "./session";
import type { usePaneOps } from "../layout/paneOps";
import type { useBroadcast } from "../broadcast/useBroadcast";
import type { usePaneOverlayHost } from "../overlays/pane";

/** Wires a pane's state and actions into the right-click menu. */
export function PaneMenu({
  x,
  y,
  renderer,
  paneId,
  session,
  ops,
  broadcast,
  override,
  setOverride,
  zoom,
  setZoom,
  copy,
  paste,
  openOverlay,
  onDismiss,
}: {
  x: number;
  y: number;
  renderer: TerminalRenderer | null;
  paneId?: string;
  session?: TerminalSession | null;
  ops: ReturnType<typeof usePaneOps>;
  broadcast: ReturnType<typeof useBroadcast>;
  override?: string;
  setOverride: (t: string | undefined) => void;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  copy: () => void;
  paste: () => Promise<void>;
  openOverlay: ReturnType<typeof usePaneOverlayHost>["openOverlay"];
  onDismiss: (refocus?: boolean) => void;
}) {
  const [serious] = usePref("serious");
  const toast = useToast();
  const [recording, setRecording] = useState(
    () => !paneId || paneRecording(paneId),
  );
  // Serious mode forces Plain everywhere: no per-pane theme choice.
  const themes = (serious ? [] : THEMES).map((t) => ({
    id: t.id,
    name: t.name,
    swatch: t.terminal.palette.cursor ?? t.terminal.palette.fg,
  }));
  return (
    <TerminalMenu
      x={x}
      y={y}
      hasSelection={!!renderer?.getSelection?.()}
      isBroadcasting={broadcast?.isBroadcasting}
      allBroadcasting={broadcast?.allBroadcasting}
      themes={themes}
      currentTheme={override}
      onCopy={copy}
      onPaste={() => void paste()}
      onSelectAll={() => renderer?.selectAll?.()}
      onClear={() => paneId && clearScrollback(paneId)}
      onSplit={(d) => ops?.split(d)}
      onTheme={(t) => {
        setOverride(t);
        // Stored per pane so reload and "Save scene" keep the choice.
        // ponytail: "default" (undefined) is not persisted; add clearPaneTheme if reload must forget it.
        if (paneId && t) setPaneTheme(paneId, t);
      }}
      onRename={ops?.rename}
      onShowScreen={() => openOverlay("show-screen")}
      onBroadcast={broadcast?.toggle}
      onBroadcastAll={broadcast?.toggleAll}
      onDiff={() => openOverlay("diff")}
      zoom={zoom}
      onZoom={(d) => setZoom((z) => (d === 0 ? 0 : z + d))}
      recording={recording}
      onToggleRecording={
        paneId
          ? () => {
              setRecording(!recording);
              setPaneRecording(paneId, !recording);
              session?.setRecording(!recording);
            }
          : undefined
      }
      onForget={
        paneId
          ? () => {
              void journalDB()
                ?.forget(paneId)
                .catch(() => {});
              session?.forget();
              toast("success", "History for this pane forgotten.");
            }
          : undefined
      }
      onKill={() => paneId && void killScene(paneId)}
      onClose={() => ops?.close()}
      onDismiss={onDismiss}
    />
  );
}
