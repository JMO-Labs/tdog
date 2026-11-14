// Entry/exit pools, ported from the ENTER/EXIT arrays in docs/design/mockup.js.
export interface Variant {
  name: string;
  keyframes: { transform?: string[]; opacity: number[] };
  times: number[];
  /** seconds */
  duration: number;
  ease?: string | number[];
}

const ID = "translate(0px,0px) rotate(0deg) scale(1,1) skewX(0deg)";
const v = (
  name: string,
  transform: string[],
  opacity: number[],
  times: number[],
  duration: number,
  ease?: Variant["ease"],
): Variant => ({
  name,
  keyframes: { transform, opacity },
  times,
  duration,
  ease,
});

export const ENTER: Variant[] = [
  v(
    "drop-bounce",
    [
      "translateY(-90px) rotate(-8deg)",
      "translateY(8px) rotate(2deg)",
      "translateY(0px) rotate(0deg)",
    ],
    [0, 1, 1],
    [0, 0.7, 1],
    0.56,
  ),
  v(
    "spin-pop",
    [
      "scale(0) rotate(-200deg)",
      "scale(1.08) rotate(6deg)",
      "scale(1) rotate(0deg)",
    ],
    [0, 1, 1],
    [0, 0.75, 1],
    0.56,
  ),
  v(
    "skate-in",
    [
      "translateX(-140px) skewX(30deg)",
      "translateX(12px) skewX(-10deg)",
      "translateX(0px) skewX(0deg)",
    ],
    [0, 1, 1],
    [0, 0.7, 1],
    0.56,
  ),
  v(
    "flip-down",
    [
      "perspective(700px) rotateX(90deg)",
      "perspective(700px) rotateX(-14deg)",
      "perspective(700px) rotateX(0deg)",
    ],
    [0, 1, 1],
    [0, 0.7, 1],
    0.56,
  ),
  v(
    "squash-stretch",
    ["scale(1.8,0.15)", "scale(0.85,1.2)", "scale(1.05,0.95)", "scale(1,1)"],
    [0, 1, 1, 1],
    [0, 0.45, 0.75, 1],
    0.56,
  ),
  v(
    "sticker-slap",
    [
      "scale(1.7) rotate(-12deg)",
      "scale(0.94) rotate(0deg)",
      "scale(1) rotate(0deg)",
    ],
    [0, 1, 1],
    [0, 0.6, 1],
    0.56,
  ),
];

const OUT_EASE = [0.5, 0, 0.75, 0];
export const EXIT: Variant[] = [
  v(
    "peel",
    [ID, "translate(60px,-40px) rotate(18deg) scale(0.7,0.7) skewX(0deg)"],
    [1, 0],
    [0, 1],
    0.44,
    OUT_EASE,
  ),
  v(
    "drain",
    [ID, "translate(0px,0px) rotate(220deg) scale(0,0) skewX(0deg)"],
    [1, 0],
    [0, 1],
    0.44,
    OUT_EASE,
  ),
  v(
    "gravity",
    [
      ID,
      "translate(0px,-14px) rotate(-4deg) scale(1,1) skewX(0deg)",
      "translate(0px,110vh) rotate(28deg) scale(1,1) skewX(0deg)",
    ],
    [1, 1, 0.7],
    [0, 0.2, 1],
    0.44,
    OUT_EASE,
  ),
  v(
    "pop",
    [
      ID,
      "translate(0px,0px) rotate(0deg) scale(1.18,1.18) skewX(0deg)",
      "translate(0px,0px) rotate(0deg) scale(0,0) skewX(0deg)",
    ],
    [1, 1, 0],
    [0, 0.3, 1],
    0.44,
    OUT_EASE,
  ),
  v(
    "skate-off",
    [ID, "translate(120vw,0px) rotate(0deg) scale(1,1) skewX(-30deg)"],
    [1, 0.5],
    [0, 1],
    0.44,
    OUT_EASE,
  ),
  v(
    "flip-away",
    ["perspective(700px) rotateY(0deg)", "perspective(700px) rotateY(90deg)"],
    [1, 0],
    [0, 1],
    0.44,
    OUT_EASE,
  ),
];

/** Reduced-motion replacement for every variant: 200 ms opacity fade. */
export const FADE: Variant = {
  name: "fade",
  keyframes: { opacity: [0, 1] },
  times: [0, 1],
  duration: 0.2,
};
const FADE_OUT: Variant = { ...FADE, keyframes: { opacity: [1, 0] } };

export function pickVariant(
  pool: Variant[],
  reduced: boolean,
  rng: () => number = Math.random,
): Variant {
  if (reduced) return pool === EXIT ? FADE_OUT : FADE;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
