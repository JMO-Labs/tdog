// Memphis confetti burst, ported from confetti() in docs/design/mockup.js.
const COLORS = ["#FF2D95", "#22D3EE", "#FFE14D", "#8B3DFF"];
const DURATION_MS = 1600;

export interface ConfettiOptions {
  /** Defaults to the prefers-reduced-motion media query. */
  reduced?: boolean;
  now?: () => number;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function confetti(canvas: HTMLCanvasElement, o: ConfettiOptions = {}) {
  if (o.reduced ?? prefersReducedMotion()) return;
  const now = o.now ?? (() => performance.now());
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = (canvas.width = innerWidth);
  const h = (canvas.height = innerHeight);
  const ps = Array.from({ length: 110 }, () => ({
    x: w / 2,
    y: h / 2,
    vx: (Math.random() - 0.5) * 18,
    vy: Math.random() * -18 - 4,
    r: Math.random() * 6,
    s: 6 + Math.random() * 8,
    k: Math.floor(Math.random() * 3),
    col: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const start = now();
  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    if (now() - start >= DURATION_MS) return;
    for (const p of ps) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.55;
      p.r += 0.1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.col;
      ctx.strokeStyle = "#160B2E";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (p.k === 0) ctx.arc(0, 0, p.s / 2, 0, 7);
      else if (p.k === 1) ctx.rect(-p.s / 2, -p.s / 2, p.s, p.s);
      else {
        ctx.moveTo(0, -p.s / 2);
        ctx.lineTo(p.s / 2, p.s / 2);
        ctx.lineTo(-p.s / 2, p.s / 2);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
