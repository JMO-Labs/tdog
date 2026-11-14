import { useLayoutEffect, useRef, useState } from "react";
import type { Scene } from "./scenes";

type Props = {
  scenes: Scene[];
  active: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onClose: (id: string) => void;
  onReorder: (id: string, to: number) => void;
  onKill: (id: string) => void;
};

/** Scene tab strip: sliding pill, inline rename, drag reorder, close, add. */
export function Tabs(p: Props) {
  const pill = useRef<HTMLSpanElement>(null);
  const wraps = useRef<Record<string, HTMLDivElement | null>>({});
  const drag = useRef<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
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
    el.style.transform = `translateX(${t.offsetLeft - 4}px)`;
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
            draggable={editing !== s.id}
            onDragStart={() => {
              drag.current = s.id;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
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
              </button>
            )}
            {p.scenes.length > 1 && (
              <button
                className="tab-x"
                aria-label={`Close scene ${s.name}`}
                onClick={() => p.onClose(s.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </nav>
      {menu && (
        <div
          className="tab-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
          <button
            role="menuitem"
            className="btn danger"
            autoFocus
            onBlur={() => setMenu(null)}
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
