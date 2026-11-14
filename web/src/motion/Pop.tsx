import { useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "motion/react";
import { ENTER, EXIT, pickVariant, type Variant } from "./variants";

const anim = (v: Variant): Transition => ({
  duration: v.duration,
  times: v.times,
  ease: (v.ease ?? "easeOut") as Transition["ease"],
});

/** Wraps chrome (never terminal text) in a random entry/exit animation. */
export function Pop({
  children,
  show = true,
  onAnimationComplete,
}: {
  children: ReactNode;
  show?: boolean;
  /** Fires when the entry/exit animation settles (use to gate terminal fit). */
  onAnimationComplete?: () => void;
}) {
  const reduced = !!useReducedMotion();
  const [pair] = useState(() => ({
    enter: pickVariant(ENTER, reduced),
    exit: pickVariant(EXIT, reduced),
  }));
  const enter = reduced ? pickVariant(ENTER, true) : pair.enter;
  const exit = reduced ? pickVariant(EXIT, true) : pair.exit;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="pop"
          initial={Object.fromEntries(
            Object.entries(enter.keyframes).map(([k, a]) => [k, a[0]]),
          )}
          animate={enter.keyframes}
          exit={{ ...exit.keyframes, transition: anim(exit) }}
          transition={anim(enter)}
          onAnimationComplete={onAnimationComplete}
          style={{ height: "100%" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
