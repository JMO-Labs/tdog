import { useEffect, type MutableRefObject, type RefObject } from "react";
import { TerminalSession, type SessionState } from "./session";
import type { TerminalRenderer } from "./renderer";
import { themeStore } from "../theme/store";
import { pickRenderer } from "./select";
import { titleStore } from "./titles";
import { registerClear } from "./paneActions";
import {
  registerPaneInput,
  unregisterPaneInput,
  getScenePanes,
} from "../broadcast/sessionRegistry";
import { getBroadcastGroup } from "../broadcast/store";
import { filterTerminalReports } from "../broadcast/terminalFilter";
import { createInputGate } from "../plugins/inputGate";
import { plugins } from "../plugins/runtime";
import { applyFont, forgetFont } from "./paneFont";
import type { Resolved } from "../presets/api";

async function createRenderer(el: HTMLElement): Promise<TerminalRenderer> {
  if (pickRenderer(location.search) === "restty") {
    const { ResttyRenderer } = await import("./resttyRenderer");
    return new ResttyRenderer(el);
  }
  const { XtermRenderer } = await import("./xtermRenderer");
  return new XtermRenderer(el);
}

function wsUrl(scene?: string, id?: string, preset?: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const q = new URLSearchParams();
  if (scene) q.set("scene", scene);
  if (id) q.set("id", id);
  if (preset) q.set("preset", preset);
  const qs = q.toString();
  return `${proto}://${location.host}/ws/term${qs ? `?${qs}` : ""}`;
}

export type Held = {
  plugin: string;
  reason: string;
  done: (run: boolean) => void;
};

type Ref<T> = MutableRefObject<T>;

/** Everything the session/renderer effect reads; all owned by the pane. */
export type TerminalSessionDeps = {
  host: RefObject<HTMLDivElement | null>;
  renderer: Ref<TerminalRenderer | null>;
  session: Ref<TerminalSession | null>;
  idRef: Ref<string | undefined>;
  keyRef: Ref<string | undefined>;
  sceneRef: Ref<string | undefined>;
  cwdRef: Ref<string | undefined>;
  hooks: Ref<{
    onSize?: (cols: number, rows: number) => void;
    onOutput?: (data: Uint8Array) => void;
    onLatency?: (ms: number) => void;
  }>;
  noteRef: Ref<() => void>;
  settledRef: Ref<boolean>;
  zoomRef: Ref<number>;
  imagesRef: Ref<boolean>;
  fontRef: Ref<Resolved>;
  connect: () => void;
  applyScope: (r: TerminalRenderer) => void;
  paintTheme: () => ReturnType<typeof themeStore.terminal>;
  paneId?: string;
  sceneId?: string;
  preset?: string;
  setState: (s: SessionState) => void;
  setHeld: (h: Held | null) => void;
};

/** Create the renderer + socket session, wire broadcast and the input gate. */
export function useTerminalSession(d: TerminalSessionDeps) {
  const {
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
  } = d;
  useEffect(() => {
    const el = host.current!;
    let cleanup = () => {};
    let cancelled = false;
    void createRenderer(el).then((r) => {
      if (cancelled) return r.dispose();
      const s = new TerminalSession(
        r,
        () => new WebSocket(wsUrl(keyRef.current, idRef.current, preset)),
        setState,
        {
          onSize: (c, r2) => hooks.current.onSize?.(c, r2),
          onOutput: (data) => {
            hooks.current.onOutput?.(data);
            noteRef.current();
          },
          onLatency: (ms) => hooks.current.onLatency?.(ms),
          interceptInput: (() => {
            // Enter waits for gate plugins (ADR-0005); everything else passes.
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            let feed: ((s: string) => void) | null = null;
            return (data, pass) => {
              feed ??= createInputGate(
                {
                  hasGate: plugins.hasGate,
                  gate: plugins.gate,
                  observe: plugins.observe,
                  currentLine: () => r.cursorLine?.() ?? "",
                  confirm: (plugin, reason) =>
                    new Promise<boolean>((done) =>
                      setHeld({
                        plugin,
                        reason,
                        done: (run) => {
                          setHeld(null);
                          done(run);
                          r.focus?.();
                        },
                      }),
                    ),
                },
                (text) => pass(enc.encode(text)),
              );
              feed(dec.decode(data));
            };
          })(),
          onBroadcast: (data) => {
            const scene = sceneRef.current;
            const pane = keyRef.current;
            if (!scene || !pane) return;
            // Filter out terminal reports (cursor position, device attributes, etc.)
            // Only broadcast actual user input
            const filtered = filterTerminalReports(data);
            if (filtered.length === 0) return; // Don't broadcast terminal reports
            const group = getBroadcastGroup(scene);
            const panes = getScenePanes(scene);
            // Fan out to all panes in the broadcast group except this one
            group.forEach((targetPaneId) => {
              if (targetPaneId === pane) return; // Don't echo back
              const targetPane = panes[targetPaneId];
              if (targetPane) targetPane.send(filtered);
            });
          },
        },
      );
      session.current = s;
      renderer.current = r;

      r.setZoom?.(zoomRef.current);
      // Register this pane for receiving broadcast input
      if (keyRef.current && sceneRef.current) {
        registerPaneInput(sceneRef.current, keyRef.current, (data) => {
          // Raw bytes, not paste: bracketed paste would insert Backspace
          // and other keys literally (^?) instead of running them.
          s.input(data);
        });
      }

      // The images effect ran before this async renderer existed: apply now.
      void r.setInlineImages?.(imagesRef.current);
      r.onTitle?.((title) => {
        if (keyRef.current) titleStore.set(keyRef.current, { title });
      });
      r.onCwd?.((cwd) => {
        cwdRef.current = cwd;
        if (keyRef.current) titleStore.set(keyRef.current, { cwd });
      });
      // ED 3: erase scrollback only; works the same in both renderers.
      const offClear = paneId
        ? registerClear(paneId, () =>
            r.write(new TextEncoder().encode("\x1b[3J")),
          )
        : () => {};
      r.setTheme(paintTheme());
      applyScope(r);
      applyFont(r, fontRef.current);
      const offTheme = themeStore.subscribe(() => {
        r.setTheme(paintTheme());
        applyScope(r);
      });
      connect();
      const ro = new ResizeObserver(() => {
        if (settledRef.current) r.resize();
      });
      ro.observe(el);
      cleanup = () => {
        // Unregister this pane from broadcasting
        if (keyRef.current && sceneRef.current) {
          unregisterPaneInput(sceneRef.current, keyRef.current);
        }
        offClear();
        offTheme();
        ro.disconnect();
        forgetFont(r);
        session.current = null;
        s.dispose();
      };
    });
    return () => {
      cancelled = true;
      cleanup();
      if (keyRef.current) titleStore.remove(keyRef.current);
    };
  }, [connect, applyScope, paneId, sceneId, paintTheme, preset]);
}
