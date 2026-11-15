import { useEffect, useRef, useState } from "react";
import { roving } from "./roving";
import { TEMPLATES, type TemplateId } from "./templates";

export interface PaneMenuProps {
  id: string;
  scenes: { id: string; name: string }[];
  onSwap: (id: string, delta: 1 | -1) => void;
  onMoveToScene: (id: string, scene: string) => void;
  onRename?: () => void;
  onDuplicate?: (id: string) => void;
  onClear?: (id: string) => void;
  onClose?: (id: string) => void;
  onBroadcastToggle?: () => void;
  isBroadcasting?: boolean;
}

/** Palette hint: every pane action is also a ⌘K command. */
const Hint = () => <kbd aria-hidden="true">⌘K</kbd>;

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
  onBroadcastToggle,
  isBroadcasting,
}: PaneMenuProps) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(false);
  const [lay, setLay] = useState(false);
  const [ask, setAsk] = useState<{ t: TemplateId; n: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      setSub(false);
      setLay(false);
      setAsk(null);
    }
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
          {onSnap && (
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={lay}
              onClick={() => setLay((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") setLay(true);
              }}
            >
              Layouts <Hint />
            </button>
          )}
          {onSnap && lay && (
            <div
              role="menu"
              aria-label="Layouts"
              className="pane-submenu"
              onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "ArrowLeft") {
                  e.stopPropagation();
                  setLay(false);
                  setAsk(null);
                }
              }}
            >
              {ask ? (
                <>
                  <button
                    role="menuitem"
                    className="danger"
                    onClick={run(() => onSnap(ask.t, true))}
                  >
                    Close {ask.n} pane{ask.n > 1 ? "s" : ""} and apply
                  </button>
                  <button role="menuitem" onClick={() => setAsk(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    role="menuitem"
                    onClick={() => {
                      const surplus = onSnap(t.id);
                      if (surplus.length)
                        setAsk({ t: t.id, n: surplus.length });
                      else setOpen(false);
                    }}
                  >
                    {t.label}
                  </button>
                ))
              )}
            </div>
          )}
          {onSplit && (
            <>
              <button role="menuitem" onClick={run(() => onSplit(id, "row"))}>
                Split right <Hint />
              </button>
              <button role="menuitem" onClick={run(() => onSplit(id, "col"))}>
                Split down <Hint />
              </button>
            </>
          )}
          {onRename && (
            <button role="menuitem" onClick={run(onRename)}>
              Rename pane <Hint />
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
          {onBroadcastToggle && (
            <button
              role="menuitem"
              aria-pressed={isBroadcasting}
              onClick={run(onBroadcastToggle)}
            >
              {isBroadcasting ? "✓ " : ""}Broadcast input
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
              Close pane <Hint />
            </button>
          )}
        </div>
      )}
    </span>
  );
}
