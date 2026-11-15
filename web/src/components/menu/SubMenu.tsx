import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../../shell/icons";
import type { MenuItem } from "./ActionMenu";

/** Pure function: flip submenu left if it would overflow right. */
export function flipSubmenuPosition(
  parentRect: DOMRect,
  submenuWidth: number,
): { left?: number; right?: number } {
  const RIGHT_THRESHOLD = 200; // pixels from right edge before flipping
  const windowRight = window.innerWidth;
  if (windowRight - parentRect.right < RIGHT_THRESHOLD + submenuWidth)
    return { right: windowRight - parentRect.left };
  return { left: parentRect.right };
}

/**
 * A side menu for one item. position: fixed (viewport coordinates) so the
 * parent's scrolling list can't clip it. Keys are handled by ActionMenu.
 */
export function SubMenu(props: {
  label: string;
  items: MenuItem[];
  /** Move focus to the first item (opened from the keyboard). */
  focusFirst: boolean;
  onSelect: (item: MenuItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left?: number;
    right?: number;
    top?: number;
  }>({ left: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement?.querySelector("[role^=menuitem]");
    if (!el || !parent) return;
    const rect = parent.getBoundingClientRect();
    const h = el.offsetHeight;
    const top = Math.max(8, Math.min(rect.top - 6, window.innerHeight - h - 8));
    setPos({ ...flipSubmenuPosition(rect, el.offsetWidth || 180), top });
  }, []);

  // Keyboard users land on the first item, also when the items change
  // (e.g. a confirmation replacing a list) while focus is inside.
  const signature = props.items.map((i) => i.label).join("\n");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (props.focusFirst || el.contains(document.activeElement))
      el.querySelector<HTMLElement>(
        "[role^=menuitem]:not([disabled])",
      )?.focus();
  }, [props.focusFirst, signature]);

  return (
    <div
      ref={ref}
      className="menu-submenu float"
      role="menu"
      aria-label={props.label}
      style={pos as React.CSSProperties}
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
            onClick={() => props.onSelect(item)}
          >
            {item.swatch && (
              <span
                className="menu-swatch"
                aria-hidden="true"
                style={{ background: item.swatch }}
              />
            )}
            {item.icon && (
              <span className="menu-row-icon" aria-hidden="true">
                <Icon name={item.icon} />
              </span>
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
          </button>
        );
      })}
    </div>
  );
}
