import { useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../../shell/icons";
import "./menu.css";

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
  onSelect?: () => void;
  submenu?: MenuItem[];
}

export interface ActionMenuProps {
  x: number;
  y: number;
  strip?: MenuItem[];
  groups: MenuItem[][];
  onDismiss: (refocus?: boolean) => void;
  ariaLabel?: string;
}

/** Pure function: flip submenu left if it would overflow right. */
export function flipSubmenuPosition(
  parentRect: DOMRect,
  submenuWidth: number,
): { left?: number; right?: number } {
  const RIGHT_THRESHOLD = 200; // pixels from right edge before flipping
  const parentRight = parentRect.right;
  const windowRight = window.innerWidth;

  if (windowRight - parentRight < RIGHT_THRESHOLD + submenuWidth) {
    // Flip to left side
    return { right: windowRight - parentRect.left };
  }
  // Default: open to the right
  return { left: parentRect.right };
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
  const [openSub, setOpenSub] = useState<string | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Reposition menu to stay in viewport
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const newPos = {
      x: Math.max(0, Math.min(props.x, window.innerWidth - r.width)),
      y: Math.max(0, Math.min(props.y, window.innerHeight - r.height)),
    };

    setPos(newPos);
    if (!filter) {
      el.querySelector<HTMLElement>(
        "[role^=menuitem]:not([disabled])",
      )?.focus();
    }
  }, [props.x, props.y, filter]);

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
    if (item.submenu) return; // Submenu items don't close menu
    props.onDismiss(refocus);
    item.onSelect?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (openSub) {
        setOpenSub(null);
        return;
      }
      if (filter) {
        setFilter("");
        return;
      }
      props.onDismiss();
      return;
    }

    // Type to filter: any printable character
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

    // If in filter input, handle navigation there
    if (filter && e.target === filterInputRef.current) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        const first = ref.current?.querySelector<HTMLElement>(
          "[role^=menuitem]:not([disabled])",
        );
        if (first) first.focus();
      }
      return;
    }

    // Keyboard navigation in menu
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        "[role^=menuitem]:not([disabled])",
      ) || [],
    );

    const current = e.target as HTMLElement;
    const i = items.indexOf(current);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = items[(i + 1) % items.length];
      next?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = items[(i - 1 + items.length) % items.length];
      prev?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const item = allVisibleItems()[i];
      if (item?.submenu) {
        setOpenSub(item.label);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (openSub) {
        setOpenSub(null);
      }
    } else if (e.key === "Enter" && i >= 0) {
      e.preventDefault();
      const item = allVisibleItems()[i];
      if (item && !item.submenu) run(item, true);
    }
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
        aria-haspopup={item.submenu ? "menu" : undefined}
        disabled={item.disabled}
        className={`menu-item ${item.danger ? "danger" : ""}`}
        title={item.tooltip}
        onClick={() => {
          if (item.submenu) {
            setOpenSub(openSub === item.label ? null : item.label);
          } else {
            run(item);
          }
        }}
        onKeyDown={(e) => {
          if (item.submenu && e.key === "ArrowRight") {
            e.preventDefault();
            setOpenSub(item.label);
          }
        }}
      >
        <span className="menu-label">{item.label}</span>
        {item.shortcut && (
          <span className="menu-shortcut">{item.shortcut}</span>
        )}
        {isRadio && item.checked && (
          <span className="menu-check" aria-hidden="true">
            ✓
          </span>
        )}
        {item.submenu && <span className="menu-arrow">›</span>}
      </button>
    );
  };

  return (
    <div
      ref={ref}
      className="action-menu pop-card"
      role="menu"
      aria-label={props.ariaLabel || "Actions"}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
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
                            onSelect={run}
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
    </div>
  );
}

function SubMenu(props: {
  label: string;
  items: MenuItem[];
  onSelect: (item: MenuItem, refocus?: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left?: number;
    right?: number;
    top?: number;
  }>({ left: 0 });

  // position: fixed in viewport coordinates, so the parent menu's scrolling
  // list (overflow) can't clip the submenu.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement?.querySelector("[role^=menuitem]");
    if (!el || !parent) return;
    const rect = parent.getBoundingClientRect();
    const h = el.offsetHeight;
    const top = Math.max(8, Math.min(rect.top - 6, window.innerHeight - h - 8));
    setPos({ ...flipSubmenuPosition(rect, el.offsetWidth || 180), top });
  }, []);

  return (
    <div
      ref={ref}
      className="menu-submenu"
      role="menu"
      aria-label={props.label}
      style={pos as React.CSSProperties}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "ArrowLeft") {
          e.stopPropagation();
        }
      }}
    >
      {props.items.map((item) => {
        const isRadio = item.isRadio ?? item.checked !== undefined;
        return (
          <button
            key={item.label}
            role={isRadio ? "menuitemradio" : "menuitem"}
            aria-checked={isRadio ? item.checked : undefined}
            disabled={item.disabled}
            className={`menu-item ${item.danger ? "danger" : ""}`}
            title={item.tooltip}
            onClick={() => props.onSelect(item, true)}
          >
            {item.swatch && (
              <span
                className="menu-swatch"
                aria-hidden="true"
                style={{ background: item.swatch }}
              />
            )}
            <span className="menu-label">{item.label}</span>
            {item.shortcut && (
              <span className="menu-shortcut">{item.shortcut}</span>
            )}
            {isRadio && item.checked && (
              <span className="menu-check" aria-hidden="true">
                ✓
              </span>
            )}
            {item.icon && (
              <span className="menu-dot">
                <Icon name={item.icon} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
