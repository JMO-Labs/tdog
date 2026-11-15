import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "../components/ui/button";
import { CommandPalette } from "../overlays/CommandPalette";
import { Sheet } from "../overlays/Sheet";
import { registerCommand } from "../overlays/commands";
import { SettingsPanel } from "../settings/SettingsPanel";
import { usePref } from "../settings/prefs";
import { THEMES } from "../theme/registry";
import { themeStore } from "../theme/store";
import { useThemeMode } from "../theme/useThemeMode";
import { Dialog } from "../overlays/Dialog";
import { useToast } from "../overlays/toast";
import { KillDialog } from "./KillDialog";
import { clearLayout } from "../layout/store";
import { moveToScene } from "../layout/transfer";
import { newId } from "../layout/tree";
import { useShellName } from "../terminal/shellName";
import { killScene } from "../terminal/sessions";
import { Icon } from "./icons";
import { type PaneOpen } from "./PaneSlot";
import { SceneView } from "./SceneView";
import { usePresetFlows } from "../presets/usePresetFlows";
import {
  addNamedScene,
  addScene,
  closeScene,
  loadScenes,
  renameScene,
  reorderScene,
  saveScenes,
} from "./scenes";
import { Pet, usePetAwake } from "./pet";
import { usePetEngine } from "./usePetEngine";
import { Tabs } from "./Tabs";
import { OverflowMenu } from "./OverflowMenu";
import { useMaxWidth } from "./useBreakpoint";
import "./shell.css";
import "./narrow.css";

type Size = { cols: number; rows: number };
const noop = () => {};
/** Latency above this gets the dial-up icon. */
const SLOW_MS = 150;

export function Workspace({
  onClosed,
  onSignedOut,
}: {
  onClosed?: () => void;
  onSignedOut?: () => void;
}) {
  const { mode, cycle } = useThemeMode();
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [latencies, setLatencies] = useState<Record<string, number>>({});
  const shellName = useShellName();
  const [focused, setFocused] = useState<string | null>(null);
  const [stamp, setStamp] = useState(0);
  const [petShown, setPetShown] = usePref("pet");
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const awake = usePetAwake(stamp);
  const engine = usePetEngine();
  const [sc, setSc] = useState(loadScenes);
  const [leafMap, setLeafMap] = useState<Record<string, string[]>>({});
  const [closing, setClosing] = useState<string | null>(null);
  const [kill, setKill] = useState<string | null>(null); // "all" or scene id
  const toast = useToast();
  useEffect(() => saveScenes(sc), [sc]);
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
  const presetDialogs = usePresetFlows({
    scene: sc.active,
    openTab: (id, name) => setSc((s) => addNamedScene(s, id, name)),
  });
  const finishClose = useCallback(
    (id: string) => {
      (leafMap[id] ?? []).forEach((p) => void killScene(p));
      clearLayout(id);
      setLeafMap((m) => {
        const rest = { ...m };
        delete rest[id];
        return rest;
      });
      setSc((s) => closeScene(s, id, newId("sc")));
    },
    [leafMap],
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
    const done = await Promise.all(targets.map((p) => killScene(p)));
    const n = done.filter(Boolean).length;
    toast("success", `Killed ${n} shell${n === 1 ? "" : "s"}.`);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === ",") {
        e.preventDefault();
        setSettings(true);
      } else if (e.key === "t" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        add();
      } else if (/^[1-9]$/.test(e.key) && !e.shiftKey && !e.altKey) {
        const target = sc.scenes[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          select(target.id);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [add, select, sc.scenes]);

  useEffect(() => {
    const offs = [
      registerCommand({
        id: "theme",
        title: "Cycle theme",
        group: "Themes",
        shortcut: "⇧⌘L",
        run: cycle,
      }),
      ...THEMES.map((t) =>
        registerCommand({
          id: `theme:${t.id}`,
          title: `Theme: ${t.name}`,
          group: "Themes",
          swatch: [
            t.terminal.palette.bg,
            t.terminal.palette.ansi[1],
            t.terminal.palette.ansi[2],
            t.terminal.palette.ansi[4],
            t.terminal.palette.fg,
          ],
          run: () => themeStore.select(t.id),
          preview: () => themeStore.preview(t.id),
          revert: () => themeStore.preview(null),
        }),
      ),
      registerCommand({
        id: "settings",
        title: "Open settings",
        group: "Panes",
        shortcut: "⌘,",
        run: () => setSettings(true),
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
    ];
    return () => offs.forEach((f) => f());
  }, [cycle, signOut, add]);

  const themeLabel = `Theme: ${mode[0].toUpperCase()}${mode.slice(1)}`;
  // Status bar follows the focused pane, else the first one.
  const ids = leafMap[sc.active] ?? [];
  const shown = focused && ids.includes(focused) ? focused : ids[0];
  const size = shown ? sizes[shown] : undefined;
  const latency = shown !== undefined ? (latencies[shown] ?? null) : null;

  const narrow = useMaxWidth(639);

  return (
    <div className="ws">
      <header className="ws-head">
        <span className="wordmark small" aria-label="tdog">
          tdog
        </span>
        <Tabs
          scenes={sc.scenes}
          active={sc.active}
          onSelect={select}
          onAdd={add}
          onRename={(id, n) => setSc((s) => renameScene(s, id, n))}
          onClose={requestClose}
          onKill={setKill}
          onReorder={(id, to) => setSc((s) => reorderScene(s, id, to))}
          onDropPane={dropOnTab}
        />
        <div className="spacer" />
        {narrow ? (
          <OverflowMenu
            items={[
              {
                label: "Studio",
                icon: "brush",
                hint: "Coming in v0.4",
                disabled: true,
                onSelect: noop,
              },
              { label: "Theme", icon: mode, onSelect: cycle },
              {
                label: "Kill all shells",
                icon: "power",
                danger: true,
                onSelect: () => setKill("all"),
              },
            ]}
          />
        ) : (
          <>
            <IconButton
              label="Studio"
              tip="Coming in v0.4"
              aria-disabled="true"
              onClick={noop}
            >
              <Icon name="brush" />
            </IconButton>
            <IconButton
              label="Theme"
              tip={themeLabel}
              shortcut="⇧⌘L"
              onClick={cycle}
            >
              <Icon name={mode} />
            </IconButton>
          </>
        )}
        <IconButton
          label="Settings"
          shortcut="⌘,"
          onClick={() => setSettings(true)}
        >
          <Icon name="gear" />
        </IconButton>
        {!narrow && (
          <IconButton
            label="Kill all shells"
            variant="danger"
            onClick={() => setKill("all")}
          >
            <Icon name="power" />
          </IconButton>
        )}
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
        <div className="spacer" />
        {latency !== null && (
          <span
            data-testid="latency"
            className={`chip num hide-xs${latency > SLOW_MS ? " slow" : ""}`}
            title={
              latency > SLOW_MS
                ? "Dial-up speeds. Typing may feel sluggish."
                : undefined
            }
          >
            <Icon name={latency > SLOW_MS ? "modem" : "bolt"} />
            {latency} ms
          </span>
        )}
        {petShown && (
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
      {presetDialogs}
      <CommandPalette open={palette} onOpenChange={setPalette} />
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
