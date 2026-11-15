import { useLayoutEffect, useRef, useState } from "react";
import { dragPane, draggedPane } from "../layout/dnd";
import type { Scene } from "./scenes";

type Props = {
  scenes: Scene[];
  active: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onClose: (id: string) => void;
  onReorder: (id: string, to: number) => void;
  /** A pane header was dropped on this scene tab. */
  onDropPane?: (paneId: string, scene: string) => void;
  onKill: (id: string) => void;
  /** Scene ids with unsaved changes against their saved preset. */
  dirty?: Set<string>;
  onSave?: (id: string) => void;
  onSaveAs?: (id: string) => void;
  /** Offer the saved scenes to open in a new tab. */
  onOpenSaved?: () => void;
};

/** Scene tab strip: sliding pill, inline rename, drag reorder, close, add. */
export function Tabs(p: Props) {
  const pill = useRef<HTMLSpanElement>(null);
  const wraps = useRef<Record<string, HTMLDivElement | null>>({});
  const drag = useRef<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [hot, setHot] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const names = p.scenes.map((s) => s.name).join("\n");

  useLayoutEffect(() => {
    const t = wraps.current[p.active];
    const el = pill.current;
    if (!t || !el) return;
    el.style.width = `${t.offsetWidth}px`;
    el.style.transform = `translateX(${t.offsetLeft - 3}px)`;
  }, [p.active, names, editing]);

  const commit = (id: string) => {
    setEditing(null);
    p.onRename(id, draft);
  };

  return (
    <div className="tabs-row">
      <nav className="tabs" role="tablist" aria-label="Scenes">
        <span ref={pill} className="tab-pill" aria-hidden="true" />
        {p.scenes.map((s, i) => (
          <div
            key={s.id}
            ref={(el) => {
              wraps.current[s.id] = el;
            }}
            className="tab-wrap"
            data-drop={hot === s.id || undefined}
            draggable={editing !== s.id}
            onDragStart={() => {
              drag.current = s.id;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggedPane() && s.id !== p.active) setHot(s.id);
            }}
            onDragLeave={() => setHot(null)}
            onDrop={(e) => {
              e.preventDefault();
              setHot(null);
              const pane = draggedPane();
              if (pane) {
                dragPane(null);
                p.onDropPane?.(pane, s.id);
                return;
              }
              if (drag.current && drag.current !== s.id)
                p.onReorder(drag.current, i);
              drag.current = null;
            }}
          >
            {editing === s.id ? (
              <input
                className="tab-edit"
                aria-label="Scene name"
                autoFocus
                value={draft}
                maxLength={32}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit(s.id);
                  else if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <button
                className="tab"
                role="tab"
                aria-selected={s.id === p.active}
                onClick={() => p.onSelect(s.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ id: s.id, x: e.clientX, y: e.clientY });
                }}
                onDoubleClick={() => {
                  setDraft(s.name);
                  setEditing(s.id);
                }}
              >
                {s.name}
                {p.dirty?.has(s.id) && (
                  <span
                    className="tab-dot"
                    role="img"
                    aria-label="Unsaved changes"
                    title="Unsaved changes"
                  />
                )}
              </button>
            )}
            <button
              className="tab-x"
              aria-label={`Close scene ${s.name}`}
              data-active={s.id === p.active || undefined}
              onClick={() => p.onClose(s.id)}
            >
              ×
            </button>
          </div>
        ))}
      </nav>
      {menu && (
        <div
          className="tab-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setMenu(null);
          }}
        >
          {(
            [
              ["Save", p.onSave],
              ["Save as…", p.onSaveAs],
            ] as const
          ).map(([label, fn]) => (
            <button
              key={label}
              role="menuitem"
              autoFocus={label === "Save"}
              className="btn"
              onClick={() => {
                fn?.(menu.id);
                setMenu(null);
              }}
            >
              {label}
            </button>
          ))}
          <button
            role="menuitem"
            className="btn"
            onClick={() => {
              p.onOpenSaved?.();
              setMenu(null);
            }}
          >
            New scene from saved…
          </button>
          <button
            role="menuitem"
            className="btn"
            onClick={() => {
              p.onClose(menu.id);
              setMenu(null);
            }}
          >
            Close scene
          </button>
          <button
            role="menuitem"
            className="btn danger"
            onClick={() => {
              p.onKill(menu.id);
              setMenu(null);
            }}
          >
            Kill scene
          </button>
        </div>
      )}
      <button
        className="tab-add"
        aria-label="New scene"
        title="New scene (⌘T)"
        onClick={p.onAdd}
      >
        +
      </button>
    </div>
  );
}
