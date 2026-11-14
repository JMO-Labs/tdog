import { useCallback, useEffect, useState } from "react";
import { IconButton } from "../components/ui/button";
import { CommandPalette } from "../overlays/CommandPalette";
import { Sheet } from "../overlays/Sheet";
import { registerCommand } from "../overlays/commands";
import { SettingsPanel } from "../settings/SettingsPanel";
import { usePref } from "../settings/prefs";
import { THEMES } from "../theme/registry";
import { themeStore } from "../theme/store";
import { useThemeMode } from "../theme/useThemeMode";
import { SplitView } from "../layout/SplitView";
import { leaves } from "../layout/tree";
import { useLayout } from "../layout/useLayout";
import { Icon } from "./icons";
import { Mascot } from "./Mascot";
import { PaneSlot } from "./PaneSlot";
import { Pet, usePetAwake } from "./pet";
import { Tabs } from "./Tabs";
import "./shell.css";

type Size = { cols: number; rows: number };
const noop = () => {};
const SCENE = "scene 1";
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
  const [focused, setFocused] = useState<string | null>(null);
  const [stamp, setStamp] = useState(0);
  const [petShown, setPetShown] = usePref("pet");
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const awake = usePetAwake(stamp);
  const layout = useLayout(SCENE);

  const onSize = useCallback(
    (id: string, cols: number, rows: number) =>
      setSizes((m) => ({ ...m, [id]: { cols, rows } })),
    [],
  );
  const onLatency = useCallback(
    (id: string, ms: number) => setLatencies((m) => ({ ...m, [id]: ms })),
    [],
  );
  const onOutput = useCallback(() => setStamp((n) => n + 1), []);

  // App owns sign-out: it sends the CSRF token and only celebrates on success.
  const signOut = useCallback(() => {
    dispatchEvent(new Event("tdog:signout"));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettings(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const offs = [
      registerCommand({
        id: "theme",
        title: "Cycle theme",
        shortcut: "⇧⌘L",
        run: cycle,
      }),
      ...THEMES.map((t) =>
        registerCommand({
          id: `theme:${t.id}`,
          title: `Theme: ${t.name}`,
          run: () => themeStore.select(t.id),
          preview: () => themeStore.preview(t.id),
          revert: () => themeStore.preview(null),
        }),
      ),
      registerCommand({
        id: "settings",
        title: "Open Settings",
        shortcut: "⌘,",
        run: () => setSettings(true),
      }),
      registerCommand({
        id: "signout",
        title: "Sign out",
        run: signOut,
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [cycle, signOut]);

  const themeLabel = `Theme: ${mode[0].toUpperCase()}${mode.slice(1)}`;
  // Status bar follows the focused pane, else the first one.
  const ids = layout.tree ? leaves(layout.tree) : [];
  const shown = focused && ids.includes(focused) ? focused : ids[0];
  const size = shown ? sizes[shown] : undefined;
  const latency = shown !== undefined ? (latencies[shown] ?? null) : null;

  return (
    <div className="ws">
      <header className="ws-head">
        <span className="wordmark small" aria-label="tdog">
          tdog
        </span>
        <Tabs scenes={["scene 1"]} active={0} />
        <div className="spacer" />
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
        <IconButton
          label="Settings"
          shortcut="⌘,"
          onClick={() => setSettings(true)}
        >
          <Icon name="gear" />
        </IconButton>
        <IconButton
          label="Kill all shells"
          variant="danger"
          tip="Available in v0.2"
          aria-disabled="true"
          onClick={noop}
        >
          <Icon name="power" />
        </IconButton>
      </header>

      <main className="panes">
        {layout.tree ? (
          <SplitView
            tree={layout.tree}
            onSplit={layout.split}
            onClose={layout.close}
            onRatio={layout.ratio}
            renderPane={(id, settled) => (
              <div
                style={{ height: "100%" }}
                onFocusCapture={() => setFocused(id)}
                onPointerDownCapture={() => setFocused(id)}
              >
                <PaneSlot
                  id={id}
                  settled={settled}
                  onClosed={onClosed}
                  onSize={onSize}
                  onOutput={onOutput}
                  onLatency={onLatency}
                />
              </div>
            )}
          />
        ) : (
          <div className="empty" data-testid="empty-panes">
            <Mascot />
            <p className="empty-big">No panes.</p>
            <p className="muted">Every shell is closed.</p>
            <button className="btn reconnect" onClick={layout.reset}>
              New pane
            </button>
          </div>
        )}
      </main>

      <footer className="status">
        <span className="chip">
          <Icon name="server" />
          container
        </span>
        <span className="chip">shell</span>
        {size && (
          <span className="chip num">
            {size.cols}×{size.rows}
          </span>
        )}
        <div className="spacer" />
        {latency !== null && (
          <span
            data-testid="latency"
            className={`chip num${latency > SLOW_MS ? " slow" : ""}`}
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
        {petShown && <Pet awake={awake} onHide={() => setPetShown(false)} />}
        <button
          className="chip kbd-chip"
          aria-label="Command palette"
          onClick={() => setPalette(true)}
        >
          <kbd>⌘K</kbd>
        </button>
      </footer>

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
