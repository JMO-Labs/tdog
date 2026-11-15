import { useEffect, useRef } from "react";
import { useCopy } from "../copy/copy";
import { Mascot } from "./Mascot";
import { timing } from "./signon";

/** Wrong-password CRT: shown ~2.4 s, then calls onDone. */
export function NoNo({
  detail,
  onDone,
}: {
  detail: string;
  onDone: () => void;
}) {
  const c = useCopy();
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), timing.nono);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="crt" role="alert">
      <Mascot pose="nono" />
      <p className="crt-big">{c("signon.denied")}</p>
      <p className="crt-small">{detail}</p>
    </div>
  );
}

/** Short loading bar after a good password; calls onDone when full. */
export function Loading({ onDone }: { onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), timing.load);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="overlay dim" role="status" aria-label="Signing in">
      <div
        className="load-bar"
        role="progressbar"
        aria-label="Signing in"
        style={{ animationDuration: `${timing.load}ms` }}
      />
    </div>
  );
}
