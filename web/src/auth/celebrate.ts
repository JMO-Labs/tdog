import { confetti } from "../motion/confetti";

/** Fire a one-off confetti burst on a throwaway full-screen canvas. */
export function celebrate(): void {
  const c = document.createElement("canvas");
  c.className = "confetti-canvas";
  document.body.append(c);
  confetti(c);
  setTimeout(() => c.remove(), 1800);
}
