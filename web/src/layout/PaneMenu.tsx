import { useRef, useState } from "react";
import { ActionMenu, type MenuItem } from "../components/menu/ActionMenu";
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
  onSplit?: (id: string, dir: "row" | "col") => void;
  /** Returns surplus pane ids when confirmation is needed (nothing applied). */
  onSnap?: (t: TemplateId, confirmed?: boolean) => string[];
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
  onSplit,
  onSnap,
}: PaneMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    t: TemplateId;
    n: number;
  } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const handleSnap = (t: TemplateId, confirmed?: boolean) => {
    const surplus = onSnap?.(t, confirmed) ?? [];
    if (surplus.length && !confirmed) {
      setConfirmation({ t, n: surplus.length });
    } else {
      setOpen(false);
    }
  };

  const layoutItems: MenuItem[] = confirmation
    ? [
        {
          label: `Close ${confirmation.n} pane${confirmation.n > 1 ? "s" : ""} and apply`,
          danger: true,
          onSelect: () => {
            handleSnap(confirmation.t, true);
            setConfirmation(null);
          },
        },
        {
          label: "Cancel",
          onSelect: () => setConfirmation(null),
        },
      ]
    : TEMPLATES.map((t) => ({
        label: t.label,
        // ponytail: empty submenu prevents ActionMenu from dismissing on click
        submenu: [],
        onSelect: () => handleSnap(t.id),
      }));

  const groups: MenuItem[][] = [
    ...(onSnap
      ? [
          [
            {
              label: "Layouts",
              submenu: layoutItems,
            },
          ],
        ]
      : []),
    ...(onSplit
      ? [
          [
            {
              label: "Split right",
              onSelect: () => onSplit(id, "row"),
            },
            {
              label: "Split down",
              onSelect: () => onSplit(id, "col"),
            },
          ],
        ]
      : []),
    ...(onRename
      ? [
          [
            {
              label: "Rename pane",
              onSelect: onRename,
            },
          ],
        ]
      : []),
    [
      {
        label: "Move to scene",
        disabled: scenes.length === 0,
        submenu: scenes.map((s) => ({
          label: s.name,
          onSelect: () => onMoveToScene(id, s.id),
        })),
      },
    ],
    ...(onDuplicate || onClear
      ? [
          [
            ...(onDuplicate
              ? [
                  {
                    label: "Duplicate pane",
                    onSelect: () => onDuplicate(id),
                  },
                ]
              : []),
            ...(onClear
              ? [
                  {
                    label: "Clear scrollback",
                    onSelect: () => onClear(id),
                  },
                ]
              : []),
          ],
        ]
      : []),
    [
      {
        label: "Swap with previous",
        onSelect: () => onSwap(id, -1),
      },
      {
        label: "Swap with next",
        onSelect: () => onSwap(id, 1),
      },
    ],
    ...(onClose
      ? [
          [
            {
              label: "Close pane",
              danger: true,
              onSelect: () => onClose(id),
            },
          ],
        ]
      : []),
  ];

  if (!open) {
    return (
      <button
        ref={btn}
        className="pane-btn icon-btn sm"
        aria-label="Pane menu"
        title="Pane menu"
        aria-haspopup="menu"
        onClick={() => setOpen(true)}
      >
        ⋯
      </button>
    );
  }

  const rect = btn.current?.getBoundingClientRect();
  const x = rect ? rect.left : 0;
  const y = rect ? rect.bottom + 4 : 0;

  return (
    <>
      <button
        ref={btn}
        className="pane-btn icon-btn sm"
        aria-label="Pane menu"
        title="Pane menu"
        aria-haspopup="menu"
        aria-expanded
        onClick={() => setOpen(false)}
      >
        ⋯
      </button>
      <ActionMenu
        x={x}
        y={y}
        groups={groups}
        onDismiss={() => setOpen(false)}
        ariaLabel="Pane actions"
      />
    </>
  );
}
