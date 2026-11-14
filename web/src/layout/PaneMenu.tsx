import { useEffect, useRef, useState } from "react";
import { roving } from "./roving";

export interface PaneMenuProps {
  id: string;
  scenes: { id: string; name: string }[];
  onSwap: (id: string, delta: 1 | -1) => void;
  onMoveToScene: (id: string, scene: string) => void;
}

/** Keyboard-reachable alternative to dragging: swap with a neighbour or move to a scene. */
export function PaneMenu({ id, scenes, onSwap, onMoveToScene }: PaneMenuProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open)
      menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open]);
  const run = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <span
      className="snap-wrap"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <button
        className="pane-btn icon-btn sm"
        aria-label="Pane menu"
        title="Pane menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div
          ref={menu}
          className="pane-menu pop-card"
          role="menu"
          aria-label="Pane actions"
          onKeyDown={(e) =>
            roving(
              e,
              "[role=menuitem]",
              { ArrowDown: 1, ArrowUp: -1, Home: "home", End: "end" },
              true,
            )
          }
        >
          <h3 className="pop-title" role="presentation">
            Pane actions
          </h3>
          <button role="menuitem" onClick={run(() => onSwap(id, -1))}>
            Swap with previous
          </button>
          <button role="menuitem" onClick={run(() => onSwap(id, 1))}>
            Swap with next
          </button>
          {scenes.map((s) => (
            <button
              key={s.id}
              role="menuitem"
              onClick={run(() => onMoveToScene(id, s.id))}
            >
              Move to {s.name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
