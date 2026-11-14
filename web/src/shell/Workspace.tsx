import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalPane } from "../TerminalPane";
import { apiFetch } from "../auth/api";
import { IconButton } from "../components/ui/button";
import { CommandPalette } from "../overlays/CommandPalette";
import { Sheet } from "../overlays/Sheet";
import { registerCommand } from "../overlays/commands";
import { useThemeMode } from "../theme/useThemeMode";
import { Icon } from "./icons";
import { Mascot } from "./Mascot";
import { Pet, usePetAwake } from "./pet";
import { Tabs } from "./Tabs";
import "./shell.css";

const noop = () => {};

export function Workspace({
  onSignedOut,
  onClosed,
}: {
  onSignedOut: () => void;
  onClosed?: () => void;
}) {
  const { mode, cycle } = useThemeMode();
  const [size, setSize] = useState<{ cols: number; rows: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [everOpen, setEverOpen] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [petShown, setPetShown] = useState(true);
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const reconnectRef = useRef<(() => void) | null>(null);
  const awake = usePetAwake(stamp);

  const onSize = useCallback(
    (cols: number, rows: number) => setSize({ cols, rows }),
    [],
  );
  const onOutput = useCallback(() => setStamp((n) => n + 1), []);
  const onOpenChange = useCallback((o: boolean) => {
    setOpen(o);
    if (o) setEverOpen(true);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } finally {
      onSignedOut();
    }
  }, [onSignedOut]);

  useEffect(() => {
    const offs = [
      registerCommand({
        id: "theme",
        title: "Cycle theme",
        shortcut: "⇧⌘L",
        run: cycle,
      }),
      registerCommand({
        id: "settings",
        title: "Open Settings",
        shortcut: "⌘,",
        run: () => setSettings(true),
      }),
      registerCommand({
        id: "signout",
        title: "Sign out",
        run: () => void signOut(),
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [cycle, signOut]);

  const themeLabel = `Theme: ${mode[0].toUpperCase()}${mode.slice(1)}`;
  const closed = everOpen && !open;

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
        <TerminalPane
          onClosed={onClosed}
          onSize={onSize}
          onOutput={onOutput}
          onOpenChange={onOpenChange}
          reconnectRef={reconnectRef}
        />
        {closed && (
          <div className="empty">
            <Mascot />
            <p className="empty-big">Nothing playing.</p>
            <p className="muted">
              Reconnect, or press <kbd>⌘K</kbd> for commands.
            </p>
            <button
              className="btn reconnect"
              onClick={() => reconnectRef.current?.()}
            >
              Reconnect
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
        <p className="muted">More settings are on the way.</p>
      </Sheet>
    </div>
  );
}
