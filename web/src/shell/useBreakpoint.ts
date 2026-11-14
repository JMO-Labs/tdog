import { useEffect, useState } from "react";

/** True while the viewport is at most `px` wide (CSS max-width media query). */
export function useMaxWidth(px: number): boolean {
  const q = `(max-width: ${px}px)`;
  const [on, setOn] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [q]);
  return on;
}
