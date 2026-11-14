import { useEffect, useRef } from "react";

const GLYPHS = "01<>/\\|+-=*#$%";
const CELL = 16;
const FRAME_MS = 80; // ~12 fps: cheap, reads as slow rain

/** Sparse falling glyphs on a canvas; the caller unmounts it when paused. */
export function GlyphRain({ intensity }: { intensity: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext?.("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    let last = 0;
    let drops: number[] = [];
    let color = "";
    const fit = () => {
      color = getComputedStyle(cv).color;
      cv.width = Math.max(1, cv.clientWidth);
      cv.height = Math.max(1, cv.clientHeight);
      drops = Array.from({ length: Math.ceil(cv.width / CELL) }, () =>
        Math.random() < 0.15 ? Math.random() * -40 : -1,
      );
    };
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    fit();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < FRAME_MS) return;
      last = t;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.font = `${CELL - 2}px monospace`;
      ctx.fillStyle = color;
      drops.forEach((y, i) => {
        if (y < 0 && Math.random() < 0.01) drops[i] = 0;
        if (drops[i]! < 0) return;
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;
        ctx.fillText(ch, i * CELL, drops[i]! * CELL);
        drops[i] = drops[i]! * CELL > cv.height ? -1 : drops[i]! + 1;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="fx fx-glyph-rain"
      style={{ opacity: 0.15 * intensity }}
    />
  );
}
