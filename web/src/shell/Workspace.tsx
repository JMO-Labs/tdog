import { useCopy } from "../copy/copy";
import { useCallback, useEffect, useState } from "react";
import { IconButton } from "../components/ui/button";
import { CommandPalette } from "../overlays/CommandPalette";
import { ThemePicker } from "../overlays/ThemePicker";
import { Sheet } from "../overlays/Sheet";
import { SettingsPanel } from "../settings/SettingsPanel";
import { pullSyncedHistory } from "../journal/pull";
import { getHistorySync, usePref } from "../settings/prefs";
import { useThemeMode } from "../theme/useThemeMode";
import { Dialog } from "../overlays/Dialog";
import { useToast } from "../overlays/toast";
import { KillDialog } from "./KillDialog";
import { addLeaf, moveToScene } from "../layout/transfer";
import { preparePane } from "../presets/launch";
import { newId } from "../layout/tree";
import { useShellName } from "../terminal/shellName";
import { usePaneTarget } from "../terminal/titles";
import { useCloseKill } from "./useCloseKill";
import { useWorkspaceCommands } from "./useWorkspaceCommands";
import { useMainMenuGroups } from "./useMainMenuGroups";
import { SearchPanel } from "../journal/SearchPanel";
import { setSceneSwitcher } from "../journal/jump";
import { Studio } from "../studio/Studio";
import { sectionFromHash } from "../studio/sections";
import { Icon } from "./icons";
import { type PaneOpen } from "./PaneSlot";
import { SceneView } from "./SceneView";
import { openScenePreset } from "../presets/openScene";
import { usePresetFlows } from "../presets/usePresetFlows";
import { useDirtyScenes } from "../presets/useDirtyScenes";
import {
  addNamedScene,
  addScene,
  loadScenes,
  renameScene,
  reorderScene,
  saveScenes,
} from "./scenes";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { Tabs } from "./Tabs";
import { MainMenu } from "./MainMenu";
import {
  toggleSceneBroadcast,
  isSceneBroadcasting,
  clearScene,
  getBroadcastGroup,
  getBroadcastStore,
} from "../broadcast/store";
import { startPlugins } from "../plugins/runtime";
import "./shell.css";
import "./narrow.css";
import "./menu.css";

type Size = { cols: number; rows: number };
/** Latency above this gets the dial-up icon. */
const SLOW_MS = 150;

export function Workspace({
  onClosed,
  onSignedOut,
}: {
  onClosed?: () => void;
  onSignedOut?: () => void;
}) {
  const { mode, cycle, set: setMode } = useThemeMode();
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [latencies, setLatencies] = useState<Record<string, number>>({});
  const shellName = useShellName();
  const [focused, setFocused] = useState<string | null>(null);
  const [serious, setSerious] = usePref("serious");
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [studio, setStudio] = useState(() => !!sectionFromHash(location.hash));
  const [sc, setSc] = useState(loadScenes);
  const [leafMap, setLeafMap] = useState<Record<string, string[]>>({});
  // Per-pane open state lives here: dockview remounts panes when splits collapse.
  const [paneOpen, setPaneOpen] = useState<Record<string, PaneOpen>>({});
  const onPaneOpen = useCallback(
    (id: string, open: boolean) =>
      setPaneOpen((m) => ({
        ...m,
        [id]: { open, everOpen: open || (m[id]?.everOpen ?? false) },
      })),
    [],
  );
  const toast = useToast();
  const c = useCopy();
  const [broadcastCount, setBroadcastCount] = useState(0);
  // Enabled plugins run for as long as the signed-in workspace is open.
  useEffect(
    () =>
      startPlugins((plugin, reason) =>
        toast("fail", `Plugin ${plugin} was stopped: it ${reason}.`),
      ),
    [toast],
  );

  useEffect(() => {
    void pullSyncedHistory().catch(() => {}); // other devices' history, once per load
  }, []);
  useEffect(() => saveScenes(sc), [sc]);
  useEffect(() => {
    return getBroadcastStore().subscribe(() => {
      setBroadcastCount(getBroadcastGroup(sc.active).size);
    });
  }, [sc.active]);
  const onLeaves = useCallback(
    (scene: string, ids: string[]) =>
      setLeafMap((m) => ({ ...m, [scene]: ids })),
    [],
  );
  const select = useCallback(
    (id: string) => setSc((s) => ({ ...s, active: id })),
    [],
  );
  const add = useCallback(() => setSc((s) => addScene(s, newId("sc"))), []);
  const openSceneTab = (id: string, name: string) =>
    setSc((s) => addNamedScene(s, id, name));
  const flows = usePresetFlows({
    scene: sc.active,
    openTab: openSceneTab,
  });
  const dirty = useDirtyScenes(sc.scenes.map((x) => x.id));
  const {
    closing,
    setClosing,
    kill,
    setKill,
    finishClose,
    requestClose,
    closeActive,
    killTargets,
    closingName,
    closingCount,
    runKill,
  } = useCloseKill(
    leafMap,
    sc.scenes,
    sc.active,
    setSc,
    setLeafMap,
    toast,
    c,
    paneOpen,
  );
  const moveScene = useCallback(
    (id: string, from: string, to: string) => void moveToScene(id, from, to),
    [],
  );
  const dropOnTab = (id: string, to: string) => {
    const from = Object.keys(leafMap).find((k) => leafMap[k]?.includes(id));
    if (from) moveScene(id, from, to);
  };
  const onSize = useCallback(
    (id: string, cols: number, rows: number) =>
      setSizes((m) => ({ ...m, [id]: { cols, rows } })),
    [],
  );
  const onLatency = useCallback(
    (id: string, ms: number) => setLatencies((m) => ({ ...m, [id]: ms })),
    [],
  );

  // App owns sign-out: it sends the CSRF token and only celebrates on success.
  const signOut = useCallback(() => {
    dispatchEvent(new Event("tdog:signout"));
  }, []);

  useKeyboardShortcuts(
    add,
    select,
    sc.scenes.map((x) => x.id),
    flows,
    setSettings,
    setStudio,
    setMenu,
    setKill,
    () => toggleSceneBroadcast(sc.active, leafMap[sc.active] ?? []),
    setSearch,
  );

  useWorkspaceCommands({
    cycle,
    signOut,
    add,
    serious,
    setSerious,
    focused,
    active: sc.active,
    leafMap,
    closeActive,
    setPicker,
    setSettings,
    setStudio,
    setSearch,
  });
  // Search hits can be in any scene: let a jump activate the pane's scene.
  useEffect(() => {
    setSceneSwitcher((pane) => {
      const id = Object.keys(leafMap).find((k) => leafMap[k].includes(pane));
      if (id) select(id);
    });
    return () => setSceneSwitcher(null);
  }, [leafMap, select]);

  const menuGroups = useMainMenuGroups({
    serious,
    setSerious,
    mode,
    setMode,
    flows,
    signOut,
    setPicker,
    setStudio,
    setSettings,
  });
  // Status bar follows the focused pane, else the first one.
  const ids = leafMap[sc.active] ?? [];
  const shown = focused && ids.includes(focused) ? focused : ids[0];
  const size = shown ? sizes[shown] : undefined;
  const target = usePaneTarget(shown);
  const latency = shown !== undefined ? (latencies[shown] ?? null) : null;

  return (
    <div className="ws">
      <header className="ws-head">
        <span className="brand" role="img" aria-label="tdog">
          <span className="logo-mark small" aria-hidden="true" />
          <span className="wordmark small" aria-hidden="true">
            tdog
          </span>
        </span>
        <Tabs
          scenes={sc.scenes}
          active={sc.active}
          onSelect={select}
          onAdd={add}
          onRename={(id, n) => setSc((s) => renameScene(s, id, n))}
          onClose={requestClose}
          onKill={setKill}
          dirty={dirty}
          onSave={(id) => void flows.save(id)}
          onSaveAs={(id) => void flows.saveAs(id)}
          onOpenSaved={() => void flows.openSaved()}
          onReorder={(id, to) => setSc((s) => reorderScene(s, id, to))}
          onDropPane={dropOnTab}
          onBroadcastAll={(id) => toggleSceneBroadcast(id, leafMap[id] ?? [])}
          broadcastAll={(id) => isSceneBroadcasting(id, leafMap[id] ?? [])}
        />
        <div className="spacer" />
        <MainMenu
          groups={menuGroups}
          open={menu}
          onOpenChange={setMenu}
          shortcut="⇧⌘M"
        />
        <IconButton
          label="Kill all shells"
          shortcut="⇧⌘K"
          variant="danger"
          onClick={() => setKill("all")}
        >
          <Icon name="power" />
        </IconButton>
      </header>

      <main className="panes">
        {sc.scenes.map((x) => (
          <SceneView
            key={x.id}
            scene={x.id}
            active={x.id === sc.active}
            paneOpen={paneOpen}
            onLeaves={onLeaves}
            onFocus={setFocused}
            scenes={sc.scenes}
            onMoveScene={moveScene}
            onOpenChange={onPaneOpen}
            onClosed={onClosed}
            onSize={onSize}
            onLatency={onLatency}
          />
        ))}
      </main>

      <footer className="status">
        <span className="sb-item">
          <Icon name="server" />
          {target}
        </span>
        {/* ponytail: shell name is only known for the container */}
        {target === "container" && <span className="sb-item">{shellName}</span>}
        {size && (
          <span className="sb-item num hide-xs">
            {size.cols}×{size.rows}
          </span>
        )}
        {broadcastCount > 0 && (
          <span className="sb-item broadcast">
            Broadcasting to {broadcastCount} pane
            {broadcastCount === 1 ? "" : "s"}
            <button
              className="stop-broadcast"
              aria-label="Stop broadcasting"
              title="Stop broadcasting"
              onClick={() => {
                clearScene(sc.active);
              }}
            >
              ✕
            </button>
          </span>
        )}
        <div className="spacer" />
        {latency !== null && (
          <span
            data-testid="latency"
            className={`sb-item num hide-xs${latency > SLOW_MS ? " slow" : ""}`}
            title={latency > SLOW_MS ? c("conn.slow") : undefined}
          >
            <Icon name={latency > SLOW_MS ? "modem" : "bolt"} />
            {latency} ms
          </span>
        )}
        <button
          className="sb-item kbd-chip"
          aria-label="Command palette"
          onClick={() => setPalette(true)}
        >
          <kbd>⌘K</kbd>
        </button>
      </footer>

      <Dialog
        open={closing !== null}
        title={`Close ${closingName}?`}
        onClose={() => setClosing(null)}
      >
        <p>
          Ends {closingCount} shell{closingCount === 1 ? "" : "s"} in it.
          Unsaved work in them is gone.
        </p>
        <div className="dialog-actions">
          <button className="btn" onClick={() => setClosing(null)}>
            Keep
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (closing) finishClose(closing);
              setClosing(null);
            }}
          >
            Close scene
          </button>
        </div>
      </Dialog>
      <KillDialog
        open={kill !== null}
        count={killTargets(kill).length}
        scope={
          kill === "all" || kill === null
            ? "all"
            : (sc.scenes.find((x) => x.id === kill)?.name ?? "")
        }
        onClose={() => setKill(null)}
        onConfirm={() => void runKill()}
      />
      {flows.dialogs}
      <Studio
        open={studio}
        onClose={() => setStudio(false)}
        onOpenScene={async (name) => {
          await openScenePreset(name, openSceneTab, toast, c);
          setStudio(false);
        }}
        onTry={(name) => {
          setStudio(false);
          void preparePane(name, toast).then((id) => {
            if (id) addLeaf(sc.active, id);
          });
        }}
      />
      <SearchPanel
        open={search}
        onClose={() => setSearch(false)}
        scenes={sc.scenes}
        leafMap={leafMap}
        syncOn={search && getHistorySync() !== "off"}
      />
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ThemePicker
        open={picker}
        pane={shown}
        onClose={() => setPicker(false)}
      />
      <Sheet
        open={settings}
        title="Settings"
        onClose={() => setSettings(false)}
      >
        <SettingsPanel onSignedOut={onSignedOut ?? (() => {})} />
      </Sheet>
    </div>
  );
}
