import { useCopy } from "../copy/copy";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "../components/ui/button";
import { CommandPalette } from "../overlays/CommandPalette";
import { ThemePicker } from "../overlays/ThemePicker";
import { Sheet } from "../overlays/Sheet";
import { registerCommand } from "../overlays/commands";
import { SettingsPanel } from "../settings/SettingsPanel";
import { getPref, usePref } from "../settings/prefs";
import { MODES, useThemeMode } from "../theme/useThemeMode";
import { Dialog } from "../overlays/Dialog";
import { useToast } from "../overlays/toast";
import { KillDialog } from "./KillDialog";
import { addLeaf, moveToScene } from "../layout/transfer";
import { preparePane } from "../presets/launch";
import { newId } from "../layout/tree";
import { useShellName } from "../terminal/shellName";
import { killScene } from "../terminal/sessions";
import { useSceneKill } from "./useSceneKill";
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
import { Pet, usePetAwake } from "./pet";
import { usePetEngine } from "./usePetEngine";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { Tabs } from "./Tabs";
import { MainMenu, type MenuGroup } from "./MainMenu";
import {
  toggleBroadcast,
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
  const [stamp, setStamp] = useState(0);
  const [petShown, setPetShown] = usePref("pet");
  const [serious, setSerious] = usePref("serious");
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [studio, setStudio] = useState(() => !!sectionFromHash(location.hash));
  const awake = usePetAwake(stamp);
  const engine = usePetEngine();
  const [sc, setSc] = useState(loadScenes);
  const [leafMap, setLeafMap] = useState<Record<string, string[]>>({});
  const [closing, setClosing] = useState<string | null>(null);
  const [kill, setKill] = useState<string | null>(null); // "all" or scene id
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
  const { removeSceneCleanup, runKill: runKillImpl } = useSceneKill(
    leafMap,
    sc.scenes,
    setSc,
    setLeafMap,
    toast,
    c,
  );

  const finishClose = useCallback(
    (id: string) => {
      (leafMap[id] ?? []).forEach((p) => void killScene(p));
      removeSceneCleanup(id);
    },
    [leafMap, removeSceneCleanup],
  );
  const moveScene = useCallback(
    (id: string, from: string, to: string) => void moveToScene(id, from, to),
    [],
  );
  const dropOnTab = (id: string, to: string) => {
    const from = Object.keys(leafMap).find((k) => leafMap[k]?.includes(id));
    if (from) moveScene(id, from, to);
  };
  const requestClose = (id: string) => {
    const running = (leafMap[id] ?? []).some((p) => paneOpen[p]?.open);
    if (running) setClosing(id);
    else finishClose(id);
  };

  const closeActive = useRef<() => void>(() => {});
  closeActive.current = () => requestClose(sc.active);

  const killTargets = (scope: string | null) =>
    (scope === "all"
      ? Object.values(leafMap).flat()
      : (leafMap[scope ?? ""] ?? [])
    ).filter((p) => paneOpen[p]?.open);
  const closingName = sc.scenes.find((x) => x.id === closing)?.name ?? "";
  const closingCount = closing
    ? (leafMap[closing] ?? []).filter((p) => paneOpen[p]?.open).length
    : 0;

  const runKill = async () => {
    const targets = killTargets(kill);
    setKill(null);
    // Nothing running (all disconnected): just remove the scene.
    if (!targets.length && kill && kill !== "all") return finishClose(kill);
    void runKillImpl(targets);
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
  const onOutput = useCallback(
    (data?: Uint8Array) => {
      setStamp((n) => n + 1);
      engine.feed(data);
    },
    [engine],
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
  );

  useEffect(() => {
    const offs = [
      registerCommand({
        id: "theme",
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
              title: "Theme…",
              group: "Themes",
              run: () => setPicker(true),
            }),
          ]),
      registerCommand({
        id: "serious",
        title: "Serious mode",
        group: "Themes",
        run: () => setSerious(!getPref("serious")),
      }),
      registerCommand({
        id: "settings",
        title: "Open settings",
        group: "Panes",
        shortcut: "⌘,",
        run: () => setSettings(true),
      }),
      registerCommand({
        id: "studio",
        title: "Open Studio",
        group: "Panes",
        shortcut: "⌘.",
        run: () => setStudio(true),
      }),
      registerCommand({
        id: "scene:new",
        title: "New scene",
        group: "Scenes",
        shortcut: "⌘T",
        run: add,
      }),
      registerCommand({
        id: "scene:close",
        title: "Close scene",
        group: "Scenes",
        run: () => closeActive.current(),
      }),
      registerCommand({
        id: "signout",
        title: "Sign out",
        group: "Account",
        run: signOut,
      }),
      registerCommand({
        id: "broadcast:toggle",
        title: "Broadcast this pane",
        group: "Panes",
        run: () => {
          if (focused) toggleBroadcast(sc.active, focused);
        },
      }),
      registerCommand({
        id: "broadcast:all",
        title: "Broadcast to all panes",
        group: "Panes",
        shortcut: "⇧⌘B",
        run: () => toggleSceneBroadcast(sc.active, leafMap[sc.active] ?? []),
      }),
      registerCommand({
        id: "broadcast:stop",
        title: "Stop broadcasting",
        group: "Panes",
        run: () => {
          if (focused && getBroadcastGroup(sc.active).has(focused)) {
            toggleBroadcast(sc.active, focused);
          }
        },
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [cycle, signOut, add, serious, setSerious, focused, sc.active, leafMap]);

  const menuGroups: MenuGroup[] = [
    [
      // Serious mode forces Plain, so theme choice is hidden.
      ...(serious
        ? []
        : [
            {
              label: "Theme…",
              icon: "system" as const,
              onSelect: () => setPicker(true),
            },
          ]),
      {
        label: "Appearance",
        icon: "light",
        submenu: MODES.map((m) => ({
          label: `${m[0].toUpperCase()}${m.slice(1)}`,
          checked: m === mode,
          onSelect: () => setMode(m),
        })),
      },
      {
        label: "Serious mode",
        icon: "briefcase",
        hint: serious ? "On" : "Off",
        onSelect: () => setSerious(!serious),
      },
      ...(serious
        ? []
        : [
            {
              label: "Dogbert",
              icon: "paw" as const,
              hint: petShown ? "Shown" : "Hidden",
              onSelect: () => setPetShown(!petShown),
            },
          ]),
    ],
    [
      {
        label: "Save scene",
        icon: "server",
        shortcut: "⌘S",
        onSelect: () => void flows.save(),
      },
      {
        label: "Save scene as…",
        icon: "server",
        onSelect: () => void flows.saveAs(),
      },
    ],
    [
      {
        label: "Studio",
        icon: "brush",
        shortcut: "⌘.",
        onSelect: () => setStudio(true),
      },
      {
        label: "Settings",
        icon: "gear",
        shortcut: "⌘,",
        onSelect: () => setSettings(true),
      },
    ],
    [{ label: "Sign out", icon: "signout", onSelect: signOut }],
  ];
  // Status bar follows the focused pane, else the first one.
  const ids = leafMap[sc.active] ?? [];
  const shown = focused && ids.includes(focused) ? focused : ids[0];
  const size = shown ? sizes[shown] : undefined;
  const latency = shown !== undefined ? (latencies[shown] ?? null) : null;

  return (
    <div className="ws">
      <header className="ws-head">
        <span className="brand" aria-label="tdog">
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
            onOutput={onOutput}
            onLatency={onLatency}
          />
        ))}
      </main>

      <footer className="status">
        <span className="chip">
          <Icon name="server" />
          container
        </span>
        <span className="chip">{shellName}</span>
        {size && (
          <span className="chip num hide-xs">
            {size.cols}×{size.rows}
          </span>
        )}
        {broadcastCount > 0 && (
          <span className="chip broadcast">
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
            className={`chip num hide-xs${latency > SLOW_MS ? " slow" : ""}`}
            title={latency > SLOW_MS ? c("conn.slow") : undefined}
          >
            <Icon name={latency > SLOW_MS ? "modem" : "bolt"} />
            {latency} ms
          </span>
        )}
        {petShown && !serious && (
          <Pet
            awake={awake}
            engine={engine.pet}
            onHide={() => setPetShown(false)}
          />
        )}
        <button
          className="chip kbd-chip"
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
