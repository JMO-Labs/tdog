import { useLayoutEffect, useRef, useState } from "react";
import { roving } from "../layout/roving";
import "../layout/layout.css";

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
  /** `refocus: false` leaves focus alone (the action takes it). */
  onDismiss: (refocus?: boolean) => void;
}

const mac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
// Only Paste has a real shortcut (native); Ctrl+Shift+C/A belong to the browser.
const mod = mac ? "⌘" : "Ctrl+Shift+";

/** Right-click menu for one terminal: the pane `⋯` menu's sibling. */
export function TerminalMenu(p: TerminalMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: p.x, y: p.y });
  const [sub, setSub] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(0, Math.min(p.x, window.innerWidth - r.width)),
      y: Math.max(0, Math.min(p.y, window.innerHeight - r.height)),
    });
    el.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [p.x, p.y]);
  useLayoutEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) p.onDismiss();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [p]);
  const run =
    (f: () => void, refocus = true) =>
    () => {
      p.onDismiss(refocus);
      f();
    };
  const item = (
    label: string,
    f: () => void,
    o: {
      key?: string;
      disabled?: boolean;
      danger?: boolean;
      refocus?: boolean;
    } = {},
  ) => (
    <button
      role="menuitem"
      disabled={o.disabled}
      className={o.danger ? "danger" : undefined}
      onClick={run(f, o.refocus)}
    >
      <span>{label}</span>
      {o.key && <kbd className="menu-key">{o.key}</kbd>}
    </button>
  );
  return (
    <div
      ref={ref}
      className="pane-menu term-menu pop-card"
      role="menu"
      aria-label="Terminal menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          p.onDismiss();
        } else if (e.key === "Tab") e.preventDefault();
        else
          roving(
            e,
            "[role=menuitem]:not(:disabled)",
            { ArrowDown: 1, ArrowUp: -1, Home: "home", End: "end" },
            true,
          );
      }}
    >
      {item("Copy", p.onCopy, { disabled: !p.hasSelection })}
      {item("Paste", p.onPaste, { key: `${mod}V` })}
      {item("Select all", p.onSelectAll)}
      {item("Clear", p.onClear)}
      <hr role="separator" />
      {p.onBroadcast && (
        <button
          role="menuitem"
          className={p.isBroadcasting ? "checked" : undefined}
          onClick={(() => {
            p.onDismiss();
            p.onBroadcast?.();
          }) as () => void}
        >
          <span>Broadcast input</span>
          {p.isBroadcasting && <span aria-hidden="true">✓</span>}
        </button>
      )}
      <hr role="separator" />
      {item("Split right", () => p.onSplit("row"))}
      {item("Split down", () => p.onSplit("col"))}
      <button
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={sub}
        onClick={() => setSub((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setSub(true);
        }}
      >
        <span>Theme for this terminal</span>
        <span aria-hidden="true">▸</span>
      </button>
      {sub && (
        <div
          role="menu"
          aria-label="Theme for this terminal"
          className="pane-submenu term-submenu"
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "ArrowLeft") {
              e.stopPropagation();
              setSub(false);
            }
          }}
        >
          {item("Page default", () => p.onTheme(undefined))}
          {p.themes.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              onClick={run(() => p.onTheme(t.id))}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {p.onRename && item("Rename", p.onRename, { refocus: false })}
      {p.onShowScreen &&
        item("Show screen text", p.onShowScreen, { refocus: false })}
      {item("Kill shell", p.onKill, { danger: true })}
      {item("Close pane", p.onClose, { danger: true })}
    </div>
  );
}
