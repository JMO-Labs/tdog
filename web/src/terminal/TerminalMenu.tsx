import { ActionMenu, type MenuItem } from "../components/menu/ActionMenu";

export interface TerminalMenuProps {
  x: number;
  y: number;
  hasSelection: boolean;
  isBroadcasting?: boolean;
  themes: { id: string; name: string }[];
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onSplit: (dir: "row" | "col") => void;
  onTheme: (id: string | undefined) => void;
  onRename?: () => void;
  onKill: () => void;
  onClose: () => void;
  onShowScreen?: () => void;
  onBroadcast?: () => void;
  onDiff?: () => void;
  /** `refocus: false` leaves focus alone (the action takes it). */
  onDismiss: (refocus?: boolean) => void;
}

const mac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = mac ? "⌘" : "Ctrl+Shift+";

/** Right-click menu for one terminal using ActionMenu. */
export function TerminalMenu(p: TerminalMenuProps) {
  const strip: MenuItem[] = [
    {
      label: "Copy",
      icon: "check",
      tooltip: "Copy",
      disabled: !p.hasSelection,
      onSelect: p.onCopy,
    },
    {
      label: "Paste",
      icon: "modem",
      tooltip: `Paste · ${mod}V`,
      onSelect: p.onPaste,
    },
    {
      label: "Clear",
      icon: "layout",
      tooltip: "Clear",
      onSelect: p.onClear,
    },
    {
      label: "Split right",
      icon: "splitRight",
      tooltip: "Split right",
      onSelect: () => p.onSplit("row"),
    },
    {
      label: "Split down",
      icon: "splitDown",
      tooltip: "Split down",
      onSelect: () => p.onSplit("col"),
    },
  ];

  const groups: MenuItem[][] = [
    [
      {
        label: "Select all",
        onSelect: p.onSelectAll,
      },
      ...(p.onDiff
        ? [
            {
              label: "Diff files…",
              onSelect: p.onDiff,
            },
          ]
        : []),
      {
        label: "Theme for this terminal",
        submenu: [
          {
            label: "Page default",
            isRadio: true,
            checked: false,
            onSelect: () => p.onTheme(undefined),
          },
          ...p.themes.map((t) => ({
            label: t.name,
            isRadio: true,
            checked: false,
            onSelect: () => p.onTheme(t.id),
          })),
        ],
      },
    ],
    [
      ...(p.onBroadcast
        ? [
            {
              label: "Broadcast input",
              isRadio: true,
              checked: p.isBroadcasting ?? false,
              onSelect: p.onBroadcast,
            },
          ]
        : []),
    ],
    [
      ...(p.onRename
        ? [
            {
              label: "Rename",
              onSelect: p.onRename,
            },
          ]
        : []),
      ...(p.onShowScreen
        ? [
            {
              label: "Show screen text",
              onSelect: p.onShowScreen,
            },
          ]
        : []),
      {
        label: "Kill shell",
        danger: true,
        onSelect: p.onKill,
      },
      {
        label: "Close pane",
        danger: true,
        onSelect: p.onClose,
      },
    ],
  ];

  return (
    <ActionMenu
      x={p.x}
      y={p.y}
      strip={strip}
      groups={groups}
      onDismiss={p.onDismiss}
      ariaLabel="Terminal menu"
    />
  );
}
