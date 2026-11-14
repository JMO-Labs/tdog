import { useEffect, useRef, useState } from "react";
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
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), timing.nono);
    return () => clearTimeout(t);
  }, []);
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
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (phase === "done") return done.current();
    const ms =
      phase === "connected"
        ? timing.hold
        : prefersReducedMotion()
          ? timing.reducedStep
          : timing.step;
    const t = setTimeout(() => setPhase(next(phase)), ms);
    return () => clearTimeout(t);
  }, [phase]);
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
