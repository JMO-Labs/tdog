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

export function TerminalPane() {
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<TerminalSession | null>(null);
  const [state, setState] = useState<SessionState>({ status: "connecting" });

  useEffect(() => {
    const el = host.current!;
    let cleanup = () => {};
    let cancelled = false;
    void createRenderer(el).then((r) => {
      if (cancelled) return r.dispose();
      const s = new TerminalSession(r, () => new WebSocket(wsUrl()), setState);
      session.current = s;
      s.connect();
      const ro = new ResizeObserver(() => r.resize());
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
