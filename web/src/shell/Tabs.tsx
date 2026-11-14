import { useLayoutEffect, useRef } from "react";

/** Scene tab strip with a sliding pill. v0.2 adds real scenes; for now one tab. */
export function Tabs({ scenes, active }: { scenes: string[]; active: number }) {
  const pill = useRef<HTMLSpanElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useLayoutEffect(() => {
    const t = tabs.current[active];
    const p = pill.current;
    if (!t || !p) return;
    p.style.width = `${t.offsetWidth}px`;
    p.style.transform = `translateX(${t.offsetLeft - 4}px)`;
  }, [active, scenes]);
  return (
    <nav className="tabs" role="tablist" aria-label="Scenes">
      <span ref={pill} className="tab-pill" aria-hidden="true" />
      {scenes.map((s, i) => (
        <button
          key={s}
          ref={(el) => {
            tabs.current[i] = el;
          }}
          className="tab"
          role="tab"
          aria-selected={i === active}
        >
          {s}
        </button>
      ))}
    </nav>
  );
}
