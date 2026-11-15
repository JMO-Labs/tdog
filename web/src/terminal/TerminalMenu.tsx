import { ActionMenu, type MenuItem } from "../components/menu/ActionMenu";

export interface TerminalMenuProps {
  x: number;
  y: number;
  hasSelection: boolean;
  isBroadcasting?: boolean;
  allBroadcasting?: boolean;
  themes: { id: string; name: string; swatch?: string }[];
  /** This pane's own theme choice; undefined = page default. */
  currentTheme?: string;
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
  onBroadcastAll?: () => void;
  onDiff?: () => void;
  /** Zoom steps for this pane (0 = theme size). */
  zoom?: number;
  /** +1 / -1 to zoom, 0 to reset. */
  onZoom?: (delta: number) => void;
  /** Whether history is recorded for this pane (default true). */
  recording?: boolean;
  onToggleRecording?: () => void;
  onForget?: () => void;
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
      icon: "copy",
      tooltip: "Copy",
      disabled: !p.hasSelection,
      onSelect: p.onCopy,
    },
    {
      label: "Paste",
      icon: "paste",
      tooltip: `Paste · ${mod}V`,
      onSelect: p.onPaste,
    },
    {
      label: "Clear",
      icon: "eraser",
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
      // No themes (serious mode): no theme submenu.
      ...(p.themes.length
        ? [
            {
              label: "Theme for this terminal",
              submenu: [
                {
                  label: "Page default",
                  isRadio: true,
                  checked: p.currentTheme === undefined,
                  onSelect: () => p.onTheme(undefined),
                },
                ...p.themes.map((t) => ({
                  label: t.name,
                  isRadio: true,
                  checked: p.currentTheme === t.id,
                  swatch: t.swatch,
                  onSelect: () => p.onTheme(t.id),
                })),
              ],
            },
          ]
        : []),
    ],
    // Zoom stays open so it can be clicked repeatedly.
    p.onZoom
      ? [
          {
            label: "Zoom in",
            keepOpen: true,
            onSelect: () => p.onZoom?.(1),
          },
          {
            label: "Zoom out",
            keepOpen: true,
            onSelect: () => p.onZoom?.(-1),
          },
          {
            label: "Reset zoom",
            hint: p.zoom ? `${p.zoom > 0 ? "+" : ""}${p.zoom}` : undefined,
            disabled: !p.zoom,
            keepOpen: true,
            onSelect: () => p.onZoom?.(0),
          },
        ]
      : [],
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
      ...(p.onBroadcastAll
        ? [
            {
              label: "Broadcast to all panes",
              isRadio: true,
              checked: p.allBroadcasting ?? false,
              shortcut: "⇧⌘B",
              onSelect: p.onBroadcastAll,
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
      ...(p.onToggleRecording
        ? [
            {
              label: "Don't record this pane",
              isRadio: true,
              checked: p.recording === false,
              onSelect: p.onToggleRecording,
            },
          ]
        : []),
      ...(p.onForget
        ? [{ label: "Forget this pane's history", onSelect: p.onForget }]
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
