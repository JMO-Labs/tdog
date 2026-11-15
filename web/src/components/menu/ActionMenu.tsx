import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../../shell/icons";
import "./menu.css";
import { SubMenu } from "./SubMenu";
export { flipSubmenuPosition } from "./SubMenu";

export interface MenuItem {
  label: string;
  icon?: IconName;
  shortcut?: string;
  tooltip?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  isRadio?: boolean;
  /** Colour dot before the label (e.g. a theme's accent). */
  swatch?: string;
  /** Short state shown at the right, e.g. "On" / "Off". */
  hint?: string;
  onSelect?: () => void;
  /** Run without closing the menu (e.g. a step inside a submenu). */
  keepOpen?: boolean;
  submenu?: MenuItem[];
}

export interface ActionMenuProps {
  x: number;
  y: number;
  strip?: MenuItem[];
  groups: MenuItem[][];
  onDismiss: (refocus?: boolean) => void;
  ariaLabel?: string;
  /** Told when a submenu opens (its label) or closes (null). */
  onSubmenuChange?: (label: string | null) => void;
}

/** Wrap the first case-insensitive match of `q` in a <mark>. */
export function highlight(text: string, q: string) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function ActionMenu(props: ActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: props.x, y: props.y });
  const [filter, setFilter] = useState("");
  const [openSub, setOpenSubState] = useState<string | null>(null);
  /** The open submenu was opened from the keyboard: focus its first item. */
  const [subFocus, setSubFocus] = useState(false);
  const setOpenSub = (label: string | null, focus = false) => {
    setOpenSubState(label);
    setSubFocus(focus);
    props.onSubmenuChange?.(label);
  };
  /** Close the submenu and put focus back on the item that opened it. */
  const closeSub = () => {
    const label = openSub;
    setOpenSub(null);
    if (label)
      [...(ref.current?.querySelectorAll<HTMLElement>("[data-sub]") ?? [])]
        .find((el) => el.dataset.sub === label)
        ?.focus();
  };
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Keep the menu inside the viewport (no focus changes here).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(0, Math.min(props.x, window.innerWidth - r.width)),
      y: Math.max(0, Math.min(props.y, window.innerHeight - r.height)),
    });
  }, [props.x, props.y]);

  // Focus the first item when the menu opens and when the filter is cleared;
  // not on every re-render, or it would pull focus out of an open submenu.
  useLayoutEffect(() => {
    if (filter) return;
    ref.current
      ?.querySelector<HTMLElement>("[role^=menuitem]:not([disabled])")
      ?.focus();
  }, [filter]);

  // Focus filter input when active
  useLayoutEffect(() => {
    if (filter && filterInputRef.current) {
      filterInputRef.current.focus();
    }
  }, [filter]);

  // Close on click outside
  useLayoutEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) {
        props.onDismiss();
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [props]);

  const run = (item: MenuItem, refocus = true) => {
    if (item.disabled) return;
    if (item.submenu) {
      // Hover already opened it; a click must not close it again.
      setOpenSub(item.label);
      return;
    }
    if (item.keepOpen) return item.onSelect?.();
    props.onDismiss(refocus);
    item.onSelect?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const root = ref.current;
    if (!root) return;
    // Keys aimed at an item act on it; keys sent to a menu act on what has
    // focus there (screen readers often send them to the menu itself).
    const target = e.target as HTMLElement;
    const active = document.activeElement as HTMLElement | null;
    const from =
      target.matches("[role^=menuitem], input") ||
      !active ||
      !root.contains(active)
        ? target
        : active;
    const level =
      (target.getAttribute("role") === "menu" && root.contains(target)
        ? target
        : from.closest<HTMLElement>("[role=menu]")) ?? root;
    const inSub = level.classList.contains("menu-submenu");

    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      if (inSub || openSub) return closeSub();
      if (filter) return setFilter("");
      return props.onDismiss(true);
    }

    // Type to filter: any printable character (not while in a submenu)
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !filter &&
      !openSub
    ) {
      setFilter(e.key);
      e.preventDefault();
      return;
    }

    // In the filter box: ArrowDown/Enter go to the first result
    if (filter && from === filterInputRef.current) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        root
          .querySelector<HTMLElement>("[role^=menuitem]:not([disabled])")
          ?.focus();
      }
      return;
    }

    // This level's own items (not those of a nested submenu)
    const items = [
      ...level.querySelectorAll<HTMLElement>(
        "[role^=menuitem]:not([disabled])",
      ),
    ].filter((el) => el.closest("[role=menu]") === level);
    const i = items.indexOf(from);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus();

    if (e.key === "ArrowDown") {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(i < 0 ? -1 : i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      const sub = from.dataset.sub;
      if (sub) {
        e.preventDefault();
        setOpenSub(sub, true);
      }
    } else if (e.key === "ArrowLeft" && inSub) {
      e.preventDefault();
      closeSub();
    }
    // Enter and Space: the focused button clicks itself.
  };

  const allVisibleItems = (): MenuItem[] => {
    const visible: MenuItem[] = [];

    if (props.strip) {
      for (const item of props.strip) {
        if (
          !filter ||
          item.label.toLowerCase().includes(filter.toLowerCase())
        ) {
          visible.push(item);
        }
      }
    }

    for (const group of props.groups) {
      for (const item of group) {
        if (
          !filter ||
          item.label.toLowerCase().includes(filter.toLowerCase()) ||
          (item.submenu?.some((s) =>
            s.label.toLowerCase().includes(filter.toLowerCase()),
          ) ??
            false)
        ) {
          visible.push(item);
        }
      }
    }

    return visible;
  };

  /** While filtering: one flat list of every matching action, submenus included. */
  const q = filter.toLowerCase();
  const hit = (m: MenuItem) => m.label.toLowerCase().includes(q);
  const results: { item: MenuItem; label: string }[] = !filter
    ? []
    : [
        ...(props.strip ?? []).filter(hit).map((item) => ({
          item,
          label: item.label,
        })),
        ...props.groups.flat().flatMap((item) =>
          item.submenu
            ? item.submenu
                .filter((s) => hit(s) || hit(item))
                .map((s) => ({
                  item: s,
                  label: `${item.label} › ${s.label}`,
                }))
            : hit(item)
              ? [{ item, label: item.label }]
              : [],
        ),
      ];

  const renderItem = (item: MenuItem) => {
    if (filter && !item.label.toLowerCase().includes(filter.toLowerCase())) {
      return null;
    }

    const isRadio = item.isRadio ?? item.checked !== undefined;

    return (
      <button
        key={item.label}
        role={
          item.submenu ? "menuitem" : isRadio ? "menuitemradio" : "menuitem"
        }
        aria-checked={isRadio ? item.checked : undefined}
        aria-expanded={item.submenu ? openSub === item.label : undefined}
        data-sub={item.submenu ? item.label : undefined}
        aria-haspopup={item.submenu ? "menu" : undefined}
        disabled={item.disabled}
        className={`menu-item ${item.danger ? "danger" : ""}`}
        title={item.tooltip}
        onClick={() => run(item)}
        // Hover opens a submenu (and closes another), like native menus.
        onPointerEnter={() => {
          if (filter || item.disabled) return;
          const want = item.submenu ? item.label : null;
          if (want !== openSub) setOpenSub(want);
        }}
      >
        <span className="menu-label">{item.label}</span>
        {item.hint && <span className="menu-hint">{item.hint}</span>}
        {item.shortcut && (
          <span className="menu-shortcut">{item.shortcut}</span>
        )}
        {isRadio && item.checked && (
          <span className="menu-check" aria-hidden="true">
            ✓
          </span>
        )}
        {item.submenu && (
          <span className="menu-arrow" aria-hidden="true">
            ›
          </span>
        )}
      </button>
    );
  };

  // Portaled to <body>: inside a pane, the next pane's stacking context
  // would paint over the menu and swallow its clicks.
  return createPortal(
    <div
      ref={ref}
      className="action-menu pop-card"
      role="menu"
      aria-label={props.ariaLabel || "Actions"}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
      onBlur={() =>
        // Focus moved somewhere else (e.g. Tab away): close. Checked a tick
        // later so a re-render that drops the focused item doesn't count.
        setTimeout(() => {
          const a = document.activeElement;
          if (
            ref.current &&
            a &&
            a !== document.body &&
            !ref.current.contains(a)
          )
            props.onDismiss(false);
        })
      }
    >
      {/* Filter input appears when user starts typing */}
      {filter && (
        <label className="menu-filter">
          <Icon name="search" />
          <input
            ref={filterInputRef}
            type="text"
            placeholder="Filter actions"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setFilter("");
              }
            }}
            aria-label="Filter actions"
          />
          <span className="menu-filter-hint">Esc</span>
        </label>
      )}

      {filter ? (
        <div className="menu-items">
          {results.length === 0 ? (
            <p className="menu-empty">No matching actions</p>
          ) : (
            results.map((r) => (
              <button
                key={r.label}
                role="menuitem"
                className={`menu-item ${r.item.danger ? "danger" : ""}`}
                disabled={r.item.disabled}
                onClick={() => run(r.item, true)}
              >
                {r.item.icon ? (
                  <span className="menu-row-icon">
                    <Icon name={r.item.icon} />
                  </span>
                ) : null}
                <span className="menu-label">{highlight(r.label, filter)}</span>
                {r.item.shortcut && (
                  <span className="menu-shortcut">{r.item.shortcut}</span>
                )}
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Icon strip for quick actions */}
          {props.strip && props.strip.length > 0 && (
            <>
              <div
                className="menu-strip"
                role="group"
                aria-label="Quick actions"
              >
                {props.strip.map((item, i) => {
                  if (
                    filter &&
                    !item.label.toLowerCase().includes(filter.toLowerCase())
                  ) {
                    return null;
                  }

                  return (
                    <button
                      key={i}
                      role="menuitem"
                      className="menu-icon-btn"
                      disabled={item.disabled}
                      title={item.tooltip || item.label}
                      aria-label={item.label}
                      onClick={() => run(item)}
                    >
                      {item.icon && <Icon name={item.icon} />}
                    </button>
                  );
                })}
              </div>
              <hr role="separator" className="menu-sep" />
            </>
          )}

          {/* Main menu items */}
          <div className="menu-items">
            {props.groups.map((group, gi) => {
              const visibleInGroup = group.filter(
                (item) =>
                  !filter ||
                  item.label.toLowerCase().includes(filter.toLowerCase()) ||
                  (item.submenu?.some((s) =>
                    s.label.toLowerCase().includes(filter.toLowerCase()),
                  ) ??
                    false),
              );

              if (visibleInGroup.length === 0) return null;

              return (
                <div key={gi}>
                  {gi > 0 && <hr role="separator" className="menu-sep" />}
                  {visibleInGroup.map((item) => {
                    const rendered = renderItem(item);
                    if (!rendered) return null;

                    return (
                      <div key={item.label} className="menu-item-with-sub">
                        {rendered}
                        {item.submenu && openSub === item.label && !filter && (
                          <SubMenu
                            label={item.label}
                            items={item.submenu}
                            focusFirst={subFocus}
                            onSelect={(sub) => run(sub, true)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Help text */}
      {filter && (
        <div className="menu-help">
          <span>↑↓ move · ↵ run</span>
          <span>⌘K all commands</span>
        </div>
      )}
    </div>,
    document.body,
  );
}
