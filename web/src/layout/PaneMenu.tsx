import { useEffect, useRef, useState } from "react";
import { roving } from "./roving";

export interface PaneMenuProps {
  id: string;
  scenes: { id: string; name: string }[];
  onSwap: (id: string, delta: 1 | -1) => void;
  onMoveToScene: (id: string, scene: string) => void;
  onRename?: () => void;
  onDuplicate?: (id: string) => void;
  onClear?: (id: string) => void;
  onClose?: (id: string) => void;
}

/** Everything you can do to one pane, reachable without dragging. */
export function PaneMenu({
  id,
  scenes,
  onSwap,
  onMoveToScene,
  onRename,
  onDuplicate,
  onClear,
  onClose,
}: PaneMenuProps) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) setSub(false);
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
          {onRename && (
            <button role="menuitem" onClick={run(onRename)}>
              Rename pane
            </button>
          )}
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={sub}
            disabled={scenes.length === 0}
            onClick={() => setSub((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setSub(true);
            }}
          >
            Move to scene
          </button>
          {sub && (
            <div
              role="menu"
              aria-label="Move to scene"
              className="pane-submenu"
              onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "ArrowLeft") {
                  e.stopPropagation();
                  setSub(false);
                }
              }}
            >
              {scenes.map((s) => (
                <button
                  key={s.id}
                  role="menuitem"
                  onClick={run(() => onMoveToScene(id, s.id))}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {onDuplicate && (
            <button role="menuitem" onClick={run(() => onDuplicate(id))}>
              Duplicate pane
            </button>
          )}
          {onClear && (
            <button role="menuitem" onClick={run(() => onClear(id))}>
              Clear scrollback
            </button>
          )}
          <button role="menuitem" onClick={run(() => onSwap(id, -1))}>
            Swap with previous
          </button>
          <button role="menuitem" onClick={run(() => onSwap(id, 1))}>
            Swap with next
          </button>
          {onClose && (
            <button
              role="menuitem"
              className="danger"
              onClick={run(() => onClose(id))}
            >
              Close pane
            </button>
          )}
        </div>
      )}
    </span>
  );
}
