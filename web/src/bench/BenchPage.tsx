import { useEffect, useRef, useState } from "react";
import type { TerminalRenderer } from "../terminal/renderer";
import { pickRenderer, type RendererKind } from "../terminal/select";
import { detectBackend, type Backend } from "./backend";
import { buildFixture } from "./fixture";
import { startFrameSampler } from "./frames";
import { replay } from "./replay";
import { fpsFromFrames, frameStats, throughputMBps } from "./stats";
import "./bench.css";

async function create(kind: RendererKind, el: HTMLElement) {
  if (kind === "restty") {
    const { ResttyRenderer } = await import("../terminal/resttyRenderer");
    return new ResttyRenderer(el);
  }
  const { XtermRenderer } = await import("../terminal/xtermRenderer");
  return new XtermRenderer(el);
}

const OPAQUE = { background: "#000000" };
const CLEAR = { background: "rgba(0,0,0,0)" };
const f1 = (n: number) => n.toFixed(1);

/** Dev-only renderer harness (ADR-0001 spike). */
export function BenchPage() {
  const kind = pickRenderer(location.search);
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<TerminalRenderer | null>(null);
  const [backend, setBackend] = useState<Backend | "…">("…");
  const [result, setResult] = useState<string>("not run");
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let alive = true;
    void detectBackend().then((b) => alive && setBackend(b));
    void create(kind, host.current!).then((r) => {
      if (!alive) return r.dispose();
      term.current = r;
      setReady(true);
    });
    const s = startFrameSampler();
    const iv = setInterval(() => {
      s.trim(120);
      setFps(fpsFromFrames(s.deltas()));
    }, 500);
    return () => {
      alive = false;
      s.stop();
      clearInterval(iv);
      term.current?.dispose();
    };
  }, [kind]);

  useEffect(
    () => term.current?.setTheme(transparent ? CLEAR : OPAQUE),
    [transparent],
  );

  async function run() {
    const r = term.current;
    if (!r) return;
    setRunning(true);
    const frames = startFrameSampler();
    const res = await replay(r, buildFixture(), { loops: 5 });
    frames.stop();
    const st = frameStats(frames.deltas());
    setResult(
      `${f1(throughputMBps(res.bytes, res.ms))} MB/s · ${res.bytes} B in ${f1(res.ms)} ms · ` +
        `frame avg ${f1(st.avg)} ms, p95 ${f1(st.p95)} ms, max ${f1(st.max)} ms (${st.count} frames)`,
    );
    setRunning(false);
  }

  return (
    <div className={transparent ? "bench bench-anim" : "bench"}>
      <header>
        <b>tdog /bench</b> renderer <code>{kind}</code> (?renderer=xterm|restty)
        · restty backend: <code data-testid="backend">{backend}</code>
        <button onClick={run} disabled={!ready || running}>
          {running ? "Running…" : "Run replay"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />{" "}
          transparent over animated background
        </label>
        · <span data-testid="fps">{f1(fps)} FPS</span>
        <div data-testid="result">{result}</div>
      </header>
      <div ref={host} className="bench-term" />
    </div>
  );
}
