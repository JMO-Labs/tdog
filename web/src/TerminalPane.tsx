import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalSession, type SessionState } from "./terminal/session";
import type { TerminalRenderer, TerminalTheme } from "./terminal/renderer";
import { themeStore } from "./theme/store";
import { pickRenderer } from "./terminal/select";
import { ConnectionGag } from "./terminal/ConnectionGag";
import { useConnectionPhase } from "./terminal/useConnectionPhase";
import { useToast } from "./overlays/toast";
import { titleStore } from "./terminal/titles";
import { useMotifOpacity } from "./settings/prefs";
import { findSessionId } from "./terminal/sessions";
import { registerClear } from "./terminal/paneActions";

/** Retry cadence while a dropped socket is being re-established. */
const RETRY_MS = 3000;

async function createRenderer(el: HTMLElement): Promise<TerminalRenderer> {
  if (pickRenderer(location.search) === "restty") {
    const { ResttyRenderer } = await import("./terminal/resttyRenderer");
    return new ResttyRenderer(el);
  }
  const { XtermRenderer } = await import("./terminal/xtermRenderer");
  return new XtermRenderer(el);
}

/** Clear the background when a motif is painted behind the text. */
function terminalPaint(t: TerminalTheme, motif: boolean): TerminalTheme {
  return motif ? { ...t, background: "rgba(0,0,0,0)" } : t;
}

function wsUrl(scene?: string, id?: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const q = new URLSearchParams();
  if (scene) q.set("scene", scene);
  if (id) q.set("id", id);
  const qs = q.toString();
  return `${proto}://${location.host}/ws/term${qs ? `?${qs}` : ""}`;
}

export function TerminalPane({
  theme,
  onClosed,
  settled = true,
  onSize,
  onOutput,
  onLatency,
  onOpenChange,
  reconnectRef,
  sceneKey,
}: {
  /** Terminal theme id for this pane; defaults to the page theme. */
  theme?: string;
  /** Stable pane key sent as the session `scene`; reload reattaches by it. */
  sceneKey?: string;
  onClosed?: () => void;
  onSize?: (cols: number, rows: number) => void;
  onOutput?: (data: Uint8Array) => void;
  /** Round-trip ms from the control-frame ping. */
  onLatency?: (ms: number) => void;
  /** True while the socket is open. */
  onOpenChange?: (open: boolean) => void;
  /** False while a layout animation runs; the terminal refits once true. */
  settled?: boolean;
  /** Filled with a function that reconnects the session. */
  reconnectRef?: { current: (() => void) | null };
} = {}) {
  const settledRef = useRef(settled);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const renderer = useRef<TerminalRenderer | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<TerminalSession | null>(null);
  const idRef = useRef<string | undefined>(undefined);
  const keyRef = useRef(sceneKey);
  /** (Re)connect; with a sceneKey, re-resolves the live session id first. */
  const connect = useCallback(() => {
    const key = keyRef.current;
    if (!key) return session.current?.connect();
    void findSessionId(key).then((id) => {
      idRef.current = id;
      session.current?.connect();
    });
  }, []);
  const [state, setState] = useState<SessionState>({ status: "connecting" });

  const toast = useToast();
  const { phase, noteOutput } = useConnectionPhase(state, () =>
    toast("success", "Reconnected. Scrollback replayed."),
  );
  const noteRef = useRef(noteOutput);
  noteRef.current = noteOutput;
  const hooks = useRef({ onSize, onOutput, onLatency });
  hooks.current = { onSize, onOutput, onLatency };

  const [motifPct] = useMotifOpacity();
  const motifUrl = motifPct > 0 ? themeStore.terminalMotif(theme) : null;
  const motifOn = motifUrl !== null;
  const motifOnRef = useRef(motifOn);
  motifOnRef.current = motifOn;
  /** Renderer colours; transparent background while a motif shows through. */
  const paintTheme = useCallback(
    () =>
      terminalPaint(themeStore.terminal(themeRef.current), motifOnRef.current),
    [],
  );

  const dropped = state.status === "closed" && state.exitCode === undefined;
  useEffect(() => {
    renderer.current?.setTheme(paintTheme());
  }, [theme, motifOn, paintTheme]);
  useEffect(() => {
    if (!dropped) return;
    const id = setTimeout(connect, RETRY_MS);
    return () => clearTimeout(id);
  }, [dropped, connect]);
  useEffect(() => {
    if (!reconnectRef) return;
    reconnectRef.current = connect;
    return () => {
      if (reconnectRef.current === connect) reconnectRef.current = null;
    };
  }, [reconnectRef, connect]);
  useEffect(() => {
    onOpenChange?.(state.status === "open");
  }, [state.status, onOpenChange]);

  useEffect(() => {
    if (state.status === "closed") onClosed?.();
  }, [state.status, onClosed]);

  useEffect(() => {
    settledRef.current = settled;
    if (settled) renderer.current?.resize();
  }, [settled]);

  useEffect(() => {
    const el = host.current!;
    let cleanup = () => {};
    let cancelled = false;
    void createRenderer(el).then((r) => {
      if (cancelled) return r.dispose();
      const s = new TerminalSession(
        r,
        () => new WebSocket(wsUrl(keyRef.current, idRef.current)),
        setState,
        {
          onSize: (c, r2) => hooks.current.onSize?.(c, r2),
          onOutput: (data) => {
            hooks.current.onOutput?.(data);
            noteRef.current();
          },
          onLatency: (ms) => hooks.current.onLatency?.(ms),
        },
      );
      session.current = s;
      renderer.current = r;
      r.onTitle?.((title) => {
        if (keyRef.current) titleStore.set(keyRef.current, { title });
      });
      r.onCwd?.((cwd) => {
        if (keyRef.current) titleStore.set(keyRef.current, { cwd });
      });
      // ED 3: erase scrollback only; works the same in both renderers.
      const offClear = sceneKey
        ? registerClear(sceneKey, () =>
            r.write(new TextEncoder().encode("\x1b[3J")),
          )
        : () => {};
      r.setTheme(paintTheme());
      const offTheme = themeStore.subscribe(() => r.setTheme(paintTheme()));
      connect();
      const ro = new ResizeObserver(() => {
        if (settledRef.current) r.resize();
      });
      ro.observe(el);
      cleanup = () => {
        offClear();
        offTheme();
        ro.disconnect();
        session.current = null;
        s.dispose();
      };
    });
    return () => {
      cancelled = true;
      cleanup();
      if (keyRef.current) titleStore.remove(keyRef.current);
    };
  }, [connect, sceneKey, paintTheme]);

  const bg = themeStore.terminal(theme).background;
  return (
    <div
      data-testid="terminal-pane"
      style={{ position: "relative", height: "100%", background: bg }}
    >
      {motifUrl && (
        <div
          data-testid="terminal-motif"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage: motifUrl,
            opacity: motifPct / 100,
          }}
        />
      )}
      <div ref={host} style={{ position: "relative", height: "100%" }} />
      <ConnectionGag phase={phase} onReconnect={connect} />
      {state.status === "closed" && state.exitCode !== undefined && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "#eee",
            background: "#000c",
            padding: 8,
          }}
        >
          {`Shell exited with code ${state.exitCode}`}{" "}
          <button onClick={connect}>Reconnect</button>
        </div>
      )}
    </div>
  );
}
