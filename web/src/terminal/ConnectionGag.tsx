import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../motion/confetti";
import type { Phase } from "./connection";
import "./gag.css";

const W = 160;
const H = 90;

function Static() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    const draw = () => {
      for (let i = 0; i < img.data.length; i += 4) {
        const g = Math.random() * 255;
        img.data.set([g, g, g, 255], i);
      }
      ctx.putImageData(img, 0, 0);
    };
    draw();
    if (prefersReducedMotion()) return;
    let raf = requestAnimationFrame(function tick() {
      draw();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="static" width={W} height={H} />;
}

/** CRT/VHS overlay for a pane while its socket drops and comes back. */
export function ConnectionGag({
  phase,
  onReconnect,
}: {
  phase: Phase;
  onReconnect: () => void;
}) {
  if (phase === "live") return null;
  if (phase === "static") return <Static />;
  const still = prefersReducedMotion() ? " still" : "";
  const tracking = phase === "tracking";
  return (
    <div className={`vhs${still}${tracking ? "" : " rew"}`} role="status">
      <span className="play">{tracking ? "▶ PLAY" : "◀◀ REW"}</span>
      {tracking ? "Adjusting tracking…" : "Rewinding…"}
      {tracking && (
        <button className="btn sticker" onClick={onReconnect}>
          Reconnect
        </button>
      )}
    </div>
  );
}
