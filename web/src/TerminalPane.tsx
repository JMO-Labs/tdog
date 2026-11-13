import { useEffect, useRef, useState } from "react";
import { TerminalSession, type SessionState } from "./terminal/session";
import { XtermRenderer } from "./terminal/xtermRenderer";

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
    const r = new XtermRenderer(el);
    const s = new TerminalSession(r, () => new WebSocket(wsUrl()), setState);
    session.current = s;
    s.connect();
    const ro = new ResizeObserver(() => r.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      s.dispose();
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
