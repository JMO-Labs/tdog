import { useEffect, useRef, useState } from "react";
import { TerminalSession, type SessionState } from "./terminal/session";
import type { TerminalRenderer } from "./terminal/renderer";
import { pickRenderer } from "./terminal/select";

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
  onOpenChange,
}: {
  onClosed?: () => void;
  onSize?: (cols: number, rows: number) => void;
  onOutput?: () => void;
  /** True while the socket is open. */
  onOpenChange?: (open: boolean) => void;
  /** False while a layout animation runs; the terminal refits once true. */
  settled?: boolean;
} = {}) {
  const settledRef = useRef(settled);
  const renderer = useRef<TerminalRenderer | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<TerminalSession | null>(null);
  const [state, setState] = useState<SessionState>({ status: "connecting" });

  const hooks = useRef({ onSize, onOutput });
  hooks.current = { onSize, onOutput };
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
        onOutput: () => hooks.current.onOutput?.(),
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
      {state.status === "closed" && (
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
          {state.exitCode === undefined
            ? "Disconnected"
            : `Shell exited with code ${state.exitCode}`}{" "}
          <button onClick={() => session.current?.connect()}>Reconnect</button>
        </div>
      )}
    </div>
  );
}
