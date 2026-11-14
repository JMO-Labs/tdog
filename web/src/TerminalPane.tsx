import { useEffect, useRef, useState } from "react";
import { TerminalSession, type SessionState } from "./terminal/session";
import type { TerminalRenderer } from "./terminal/renderer";
import { pickRenderer } from "./terminal/select";
import { ConnectionGag } from "./terminal/ConnectionGag";
import { useConnectionPhase } from "./terminal/useConnectionPhase";
import { useToast } from "./overlays/toast";

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

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/term`;
}

export function TerminalPane({
  onClosed,
  settled = true,
  onSize,
  onOutput,
  onLatency,
  onOpenChange,
  reconnectRef,
}: {
  onClosed?: () => void;
  onSize?: (cols: number, rows: number) => void;
  onOutput?: () => void;
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
  const renderer = useRef<TerminalRenderer | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<TerminalSession | null>(null);
  const [state, setState] = useState<SessionState>({ status: "connecting" });

  const toast = useToast();
  const { phase, noteOutput } = useConnectionPhase(state, () =>
    toast("success", "Reconnected. Scrollback replayed."),
  );
  const noteRef = useRef(noteOutput);
  noteRef.current = noteOutput;
  const hooks = useRef({ onSize, onOutput, onLatency });
  hooks.current = { onSize, onOutput, onLatency };

  const dropped = state.status === "closed" && state.exitCode === undefined;
  useEffect(() => {
    if (!dropped) return;
    const id = setTimeout(() => session.current?.connect(), RETRY_MS);
    return () => clearTimeout(id);
  }, [dropped]);
  useEffect(() => {
    if (!reconnectRef) return;
    reconnectRef.current = () => session.current?.connect();
    return () => {
      reconnectRef.current = null;
    };
  }, [reconnectRef]);
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
      const s = new TerminalSession(r, () => new WebSocket(wsUrl()), setState, {
        onSize: (c, r2) => hooks.current.onSize?.(c, r2),
        onOutput: () => {
          hooks.current.onOutput?.();
          noteRef.current();
        },
        onLatency: (ms) => hooks.current.onLatency?.(ms),
      });
      session.current = s;
      renderer.current = r;
      s.connect();
      const ro = new ResizeObserver(() => {
        if (settledRef.current) r.resize();
      });
      ro.observe(el);
      cleanup = () => {
        ro.disconnect();
        s.dispose();
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div
      data-testid="terminal-pane"
      style={{ position: "relative", height: "100%" }}
    >
      <div ref={host} style={{ height: "100%" }} />
      <ConnectionGag
        phase={phase}
        onReconnect={() => session.current?.connect()}
      />
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
          <button onClick={() => session.current?.connect()}>Reconnect</button>
        </div>
      )}
    </div>
  );
}
