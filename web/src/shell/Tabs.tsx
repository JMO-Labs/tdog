import { useRef, useState } from "react";
import { dragPane, draggedPane } from "../layout/dnd";
import { ActionMenu, type MenuItem } from "../components/menu/ActionMenu";
import { usePref } from "../settings/prefs";
import { setSceneArt } from "../presets/panes";
import { useSceneArt } from "../terminal/useSceneArt";
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
  /** Scene-wide broadcast toggle and its checked state. */
  onBroadcastAll?: (id: string) => void;
  broadcastAll?: (id: string) => boolean;
};

/** Scene tab strip: underlined active tab, inline rename, drag reorder, close, add. */
export function Tabs(p: Props) {
  const drag = useRef<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [hot, setHot] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const [serious] = usePref("serious");
  const art = useSceneArt(menu?.id ?? "");

  const startEdit = (id: string, name: string) => {
    setDraft(name);
    setEditing(id);
  };
  const commit = (id: string) => {
    setEditing(null);
    p.onRename(id, draft);
  };

  return (
    <div className="tabs-row">
      <nav className="tabs" role="tablist" aria-label="Scenes">
        {p.scenes.map((s, i) => (
          <div
            key={s.id}
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
                className={s.id === p.active ? "tab on" : "tab"}
                role="tab"
                aria-selected={s.id === p.active}
                onClick={() => p.onSelect(s.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ id: s.id, x: e.clientX, y: e.clientY });
                }}
                onDoubleClick={() => startEdit(s.id, s.name)}
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
      {menu &&
        (() => {
          const name = p.scenes.find((s) => s.id === menu.id)?.name ?? "";
          const groups: MenuItem[][] = [
            [
              {
                label: "Rename",
                onSelect: () => startEdit(menu.id, name),
              },
              ...(p.onSave
                ? [
                    {
                      label: "Save",
                      onSelect: () => p.onSave?.(menu.id),
                    },
                  ]
                : []),
              ...(p.onSaveAs
                ? [
                    {
                      label: "Save as…",
                      onSelect: () => p.onSaveAs?.(menu.id),
                    },
                  ]
                : []),
            ],
            ...(p.onOpenSaved
              ? [
                  [
                    {
                      label: "New scene from saved…",
                      onSelect: () => p.onOpenSaved?.(),
                    },
                  ],
                ]
              : []),
            ...(p.onBroadcastAll
              ? [
                  [
                    {
                      label: "Broadcast to all panes",
                      isRadio: true,
                      checked: p.broadcastAll?.(menu.id) ?? false,
                      shortcut: "⇧⌘B",
                      onSelect: () => p.onBroadcastAll?.(menu.id),
                    },
                  ],
                ]
              : []),
            ...(serious
              ? []
              : [
                  [
                    {
                      label: "Theme art in this scene",
                      isRadio: true,
                      checked: art,
                      onSelect: () => setSceneArt(menu.id, !art),
                    },
                  ],
                ]),
            [
              {
                label: "Close scene",
                onSelect: () => p.onClose(menu.id),
              },
              {
                label: "Kill scene",
                danger: true,
                onSelect: () => p.onKill(menu.id),
              },
            ],
          ];
          return (
            <ActionMenu
              x={menu.x}
              y={menu.y}
              groups={groups}
              onDismiss={() => setMenu(null)}
              ariaLabel="Scene actions"
            />
          );
        })()}
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
