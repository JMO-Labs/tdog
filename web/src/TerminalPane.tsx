import { useCopy } from "./copy/copy";
import {
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { TerminalSession, type SessionState } from "./terminal/session";
import type { TerminalRenderer } from "./terminal/renderer";
import { themeStore } from "./theme/store";
import { ConnectionGag } from "./terminal/ConnectionGag";
import { PaneIntro } from "./terminal/PaneIntro";
import { useConnectionPhase } from "./terminal/useConnectionPhase";
import { useToast } from "./overlays/toast";
import { PaneOverlayHost, usePaneOverlayHost } from "./overlays/pane";
import { BackgroundLayer } from "./backgrounds/BackgroundLayer";
import { SceneBgContext } from "./backgrounds/SceneBackground";
import { bgSpec } from "./backgrounds/spec";
import { EffectsOverlay } from "./effects/EffectsOverlay";
import { useActiveEffects } from "./effects/useActiveEffects";
import { titleStore } from "./terminal/titles";
import { SceneArtContext } from "./terminal/useSceneArt";
import { useMotifOpacity, usePref } from "./settings/prefs";
import { resolvePreset, type Resolved } from "./presets/api";
import { EndedPanel } from "./terminal/EndedPanel";
import {
  clearKilled,
  isKilled,
  markKilled,
  subscribeKilled,
} from "./terminal/killed";
import { PaneMenu } from "./terminal/PaneMenu";
import { useJournalMarkers } from "./journal/useJournalMarkers";
import { GapBanner } from "./journal/GapBanner";
import { usePaneCommands } from "./terminal/usePaneCommands";
import { usePaneOps } from "./layout/paneOps";
import { killScene } from "./terminal/sessions";
import {
  paneTheme,
  panePreset,
  resolveSession,
  paneZoom,
  setPaneZoom,
} from "./presets/panes";
import { useBroadcast } from "./broadcast/useBroadcast";
import { GateConfirm } from "./plugins/GateConfirm";

import { useTerminalSession, type Held } from "./terminal/useTerminalSession";
import { applyFont, applyThemeScope, terminalPaint } from "./terminal/paneFont";

export { applyFont };

/** Retry cadence while a dropped socket is being re-established. */
const RETRY_MS = 3000;
const NO_FX: never[] = [];

export function TerminalPane({
  theme,
  onClosed,
  settled = true,
  visible = true,
  onSize,
  onOutput,
  onLatency,
  onOpenChange,
  reconnectRef,
  sceneKey: paneId,
  sceneId,
}: {
  /** Terminal theme id for this pane; defaults to the page theme. */
  theme?: string;
  /** Stable pane key sent as the session `scene`; reload reattaches by it. */
  sceneKey?: string;
  /** Scene ID containing this pane. */
  sceneId?: string;
  onClosed?: () => void;
  onSize?: (cols: number, rows: number) => void;
  onOutput?: (data: Uint8Array) => void;
  /** Round-trip ms from the control-frame ping. */
  onLatency?: (ms: number) => void;
  /** True while the socket is open. */
  onOpenChange?: (open: boolean) => void;
  /** False for panes in a hidden scene; their font loads once visible. */
  visible?: boolean;
  /** False while a layout animation runs; the terminal refits once true. */
  settled?: boolean;
  /** Filled with a function that reconnects the session. */
  reconnectRef?: { current: (() => void) | null };
} = {}) {
  const settledRef = useRef(settled);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // A terminal preset's theme and font apply to this pane only.
  const preset = paneId ? panePreset(paneId) : undefined;
  const [resolved, setResolved] = useState<Resolved>({});
  const presetTheme = resolved.theme?.value;
  const [override, setOverride] = useState<string | undefined>();
  // Per-pane zoom steps on top of the theme/preset font size.
  const [zoom, setZoom] = useState(() => (paneId ? paneZoom(paneId) : 0));
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    renderer.current?.setZoom?.(zoom);
    if (paneId) setPaneZoom(paneId, zoom);
  }, [zoom, paneId]);
  theme ??= paneId ? paneTheme(paneId) : undefined;
  theme ??= typeof presetTheme === "string" ? presetTheme : undefined;
  // The theme picker previews on the focused pane only.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => themeStore.subscribe(bump), []);
  theme = override ?? themeStore.paneTheme(paneId, theme);
  const fontRef = useRef<Resolved>({});
  fontRef.current = resolved;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  useEffect(() => {
    if (paneId && theme) titleStore.set(paneId, { theme });
  }, [paneId, theme]);
  const renderer = useRef<TerminalRenderer | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<TerminalSession | null>(null);
  const idRef = useRef<string | undefined>(undefined);
  const keyRef = useRef(paneId);
  const sceneRef = useRef(sceneId);
  const cwdRef = useRef<string | undefined>(undefined);
  /** (Re)connect; with a sceneKey, re-resolves the live session id first. */
  const connect = useCallback(() => {
    const key = keyRef.current;
    if (key && isKilled(key)) return; // only the "Start a new shell" button revives it
    if (!key) return session.current?.connect();
    void resolveSession(key).then((id) => {
      idRef.current = id;
      session.current?.connect();
    });
  }, []);
  useEffect(() => {
    if (!preset) return;
    let live = true;
    resolvePreset(preset).then(
      (r) => live && setResolved(r),
      () => {}, // validation errors were toasted when the pane was opened
    );
    return () => void (live = false);
  }, [preset]);
  const [state, setState] = useState<SessionState>({ status: "connecting" });
  const [storeKilled, setStoreKilled] = useState(
    () => !!paneId && isKilled(paneId),
  );
  useEffect(() => {
    const sync = () =>
      setStoreKilled(!!keyRef.current && isKilled(keyRef.current));
    sync();
    return subscribeKilled(sync);
  }, []);
  const killed =
    storeKilled || (state.status === "closed" && state.killed === true);
  useEffect(() => {
    if (state.status === "closed" && state.killed && keyRef.current)
      markKilled(keyRef.current);
  }, [state]);
  const startNew = useCallback(() => {
    if (keyRef.current) clearKilled(keyRef.current);
    setStoreKilled(false);
    connect();
  }, [connect]);

  const toast = useToast();
  const c = useCopy();
  const { phase, noteOutput } = useConnectionPhase(state, () =>
    toast("success", c("conn.back")),
  );
  const noteRef = useRef(noteOutput);
  noteRef.current = noteOutput;
  const hooks = useRef({ onSize, onOutput, onLatency });
  hooks.current = { onSize, onOutput, onLatency };

  const broadcast = useBroadcast(sceneId, paneId);

  sceneRef.current = sceneId;

  const art = useContext(SceneArtContext);
  const [themeFx, setEffects] = useState(() => themeStore.effects(theme));
  useEffect(() => {
    const sync = () => setEffects(themeStore.effects(theme));
    sync();
    return themeStore.subscribe(sync);
  }, [theme]);
  const effects = art ? themeFx : NO_FX;
  const rainBehind = useActiveEffects(effects).some(
    (e) => e.id === "glyph-rain",
  );
  const [motifPct] = useMotifOpacity();
  const motifUrl = art && motifPct > 0 ? themeStore.terminalMotif(theme) : null;
  const motifOn = motifUrl !== null;
  /** Something paints behind the text: the renderer must be transparent. */
  const sceneBg = useContext(SceneBgContext);
  const [perf] = usePref("perf");
  const paneBg = bgSpec(resolved);
  const hasBg = !perf && paneBg !== null;
  const clear = motifOn || rainBehind || hasBg || (sceneBg && !perf);
  const clearRef = useRef(clear);
  clearRef.current = clear;
  /** Renderer colours; transparent background while a motif or rain shows through. */
  const paintTheme = useCallback(
    () =>
      terminalPaint(themeStore.terminal(themeRef.current), clearRef.current),
    [],
  );

  const scopeFontRef = useRef<string | null>(null);
  const applyScope = useCallback(
    (r: TerminalRenderer) =>
      applyThemeScope(r, {
        renderer,
        theme: themeRef,
        font: fontRef,
        visible: visibleRef,
        scopeFont: scopeFontRef,
      }),
    [],
  );

  const dropped =
    state.status === "closed" && state.exitCode === undefined && !killed;
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.setTheme(paintTheme());
    applyScope(r);
  }, [theme, visible, clear, paintTheme, applyScope]);
  useEffect(() => {
    applyFont(renderer.current, resolved);
  }, [resolved]);
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

  /** A gate plugin held a command in this pane and wants the user to decide. */
  const [held, setHeld] = useState<Held | null>(null);
  const [images] = usePref("images");
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => {
    renderer.current?.setInlineImages?.(images);
  }, [images]);

  useTerminalSession({
    host,
    renderer,
    session,
    idRef,
    keyRef,
    sceneRef,
    cwdRef,
    hooks,
    noteRef,
    settledRef,
    zoomRef,
    imagesRef,
    fontRef,
    connect,
    applyScope,
    paintTheme,
    paneId,
    sceneId,
    preset,
    setState,
    setHeld,
  });

  const ops = usePaneOps();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const openMenu = (x: number, y: number) => setMenu({ x, y });
  const closeMenu = (refocus = true) => {
    setMenu(null);
    if (refocus) renderer.current?.focus?.();
  };
  const { hostRef, openOverlay } = usePaneOverlayHost();
  useJournalMarkers(paneId, renderer, openOverlay);
  const paste = async () => {
    try {
      renderer.current?.paste?.(await navigator.clipboard.readText());
    } catch {
      toast(
        "fail",
        "Allow clipboard access in your browser to paste here, or press Ctrl+Shift+V.",
      );
    }
  };
  const copy = () => {
    const t = renderer.current?.getSelection?.() ?? "";
    if (t)
      void Promise.resolve(navigator.clipboard.writeText(t)).catch(() => {});
  };
  usePaneCommands(!!ops?.focused, {
    copy,
    paste: () => void paste(),
    selectAll: () => renderer.current?.selectAll?.(),
    diff: () => openOverlay("diff"),
    showScreen: () => openOverlay("show-screen"),
    kill: () => paneId && void killScene(paneId),
  });
  const bg =
    sceneBg && !perf ? "transparent" : themeStore.terminal(theme).background;
  return (
    <div
      data-testid="terminal-pane"
      onContextMenuCapture={(e) => {
        // Apps that track the mouse keep right-clicks unless Shift is held.
        if (renderer.current?.mouseReporting?.() && !e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        openMenu(e.clientX, e.clientY);
      }}
      onKeyDownCapture={(e) => {
        if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
          const c = renderer.current?.cursorRect?.();
          if (c) return openMenu(c.x, c.y);
          const r = e.currentTarget.getBoundingClientRect();
          openMenu(r.left + 16, r.top + 16);
        }
      }}
      style={{
        position: "relative",
        height: "100%",
        boxSizing: "border-box",
        padding: 8,
        background: bg,
      }}
    >
      <BackgroundLayer spec={paneBg} />
      {motifUrl && (
        <div
          data-testid="terminal-motif"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
            backgroundImage: motifUrl,
            opacity: motifPct / 100,
          }}
        />
      )}
      <EffectsOverlay layer="behind" effects={effects} />
      <div
        ref={host}
        style={{ position: "relative", zIndex: 1, height: "100%" }}
      />
      <EffectsOverlay effects={effects} />
      <GapBanner
        pane={paneId}
        onRestore={(rec) => session.current?.restore(rec)}
      />
      <ConnectionGag phase={phase} onReconnect={connect} />
      <PaneIntro theme={theme} />
      {(killed ||
        (state.status === "closed" && state.exitCode !== undefined)) && (
        <EndedPanel
          killed={killed}
          exitCode={state.status === "closed" ? state.exitCode : undefined}
          onStart={killed ? startNew : connect}
        />
      )}
      {held && (
        <GateConfirm
          plugin={held.plugin}
          reason={held.reason}
          onDone={held.done}
        />
      )}
      <PaneOverlayHost
        renderer={renderer.current}
        handle={hostRef}
        sessionId={idRef.current}
        cwd={cwdRef.current}
      />
      {menu && (
        <PaneMenu
          {...menu}
          renderer={renderer.current}
          paneId={paneId}
          session={session.current}
          ops={ops}
          broadcast={broadcast}
          override={override}
          setOverride={setOverride}
          zoom={zoom}
          setZoom={setZoom}
          copy={copy}
          paste={paste}
          openOverlay={openOverlay}
          onDismiss={closeMenu}
        />
      )}
    </div>
  );
}
