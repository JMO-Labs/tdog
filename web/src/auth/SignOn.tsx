import { useEffect, useState } from "react";
import { Mascot } from "./Mascot";
import { initial, label, lit, next, STEPS, timing, type Phase } from "./signon";
import { prefersReducedMotion } from "../motion/confetti";

/** Wrong-password CRT: shown ~2.4 s, then calls onDone. */
export function NoNo({
  detail,
  onDone,
}: {
  detail: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, timing.nono);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="crt" role="alert">
      <Mascot pose="nono" />
      <p className="crt-big">Ah ah ah!</p>
      <p className="crt-small">{detail}</p>
    </div>
  );
}

/** Dial-up overlay; calls onDone after Connected! has been shown. */
export function DialUp({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>(initial);
  useEffect(() => {
    if (phase === "done") return onDone();
    const ms =
      phase === "connected"
        ? timing.hold
        : prefersReducedMotion()
          ? timing.reducedStep
          : timing.step;
    const t = setTimeout(() => setPhase(next(phase)), ms);
    return () => clearTimeout(t);
  }, [phase, onDone]);
  return (
    <div className="overlay dim" role="status" aria-label="Signing on">
      <div className="card dialup-card">
        {phase === "connected" && <Mascot pose="wave" />}
        <h2 className="card-title">Signing on</h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s} className={lit(phase, s) ? "on" : undefined}>
              <span className="step-ico" aria-hidden="true" />
              {label(s)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
