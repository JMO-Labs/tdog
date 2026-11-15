import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconButton } from "../components/ui/button";
import { Icon, type IconName } from "./icons";

export type MenuEntry = {
  label: string;
  icon?: IconName;
  shortcut?: string;
  hint?: string;
  disabled?: boolean;
  checked?: boolean;
  onSelect?: () => void;
  submenu?: MenuEntry[];
};
export type MenuGroup = MenuEntry[];

const itemsOf = (menu: Element) =>
  Array.from(menu.querySelectorAll<HTMLElement>("[role^=menuitem]")).filter(
    (e) => e.closest("[role=menu]") === menu,
  );

/** Header main menu: grouped items, nested popovers, arrow-key navigation. */
export function MainMenu({
  groups,
  open: controlled,
  onOpenChange,
  shortcut,
}: {
  groups: MenuGroup[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcut?: string;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (o: boolean) => (onOpenChange ?? setInner)(o);
  const [sub, setSub] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLDivElement>(null);
  const close = (refocus = false) => {
    setSub(null);
    setOpen(false);
    if (refocus) btn.current?.querySelector("button")?.focus();
  };

  // Focus the first item of the menu that just appeared.
  const focusFirst = () => {
    const menus = root.current?.querySelectorAll("[role=menu]");
    const last = menus?.[menus.length - 1];
    if (last) itemsOf(last)[0]?.focus();
  };
  useEffect(() => {
    if (open) focusFirst();
  }, [open]);
  useEffect(() => {
    if (sub !== null) focusFirst();
  }, [sub]);

  useEffect(() => {
    if (!open) return;
    const press = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", press);
    return () => document.removeEventListener("pointerdown", press);
  });

  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    const menu = el.closest("[role=menu]");
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (!menu) return;
    const list = itemsOf(menu);
    const i = list.indexOf(el);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "ArrowRight" && el.dataset.sub) {
      e.preventDefault();
      setSub(el.dataset.sub);
    } else if (e.key === "ArrowLeft" && sub) {
      e.preventDefault();
      const parent = root.current?.querySelector<HTMLElement>(
        `[data-sub="${sub}"]`,
      );
      setSub(null);
      parent?.focus();
    }
  };

  const run = (m: MenuEntry) => {
    if (m.disabled) return;
    if (m.submenu) return setSub(m.label);
    close(true);
    m.onSelect?.();
  };

  const renderItem = (m: MenuEntry, nested: boolean) => {
    const radio = nested && m.checked !== undefined;
    const body = (
      <button
        key={m.label}
        type="button"
        role={radio ? "menuitemradio" : "menuitem"}
        aria-checked={radio ? m.checked : undefined}
        aria-haspopup={m.submenu ? "menu" : undefined}
        aria-expanded={m.submenu ? sub === m.label : undefined}
        aria-disabled={m.disabled || undefined}
        data-sub={m.submenu ? m.label : undefined}
        tabIndex={-1}
        onClick={() => run(m)}
      >
        {m.icon ? <Icon name={m.icon} /> : <span className="mm-gap" />}
        {m.label}
        {m.hint && <small className="mm-hint">{m.hint}</small>}
        {m.shortcut && <kbd className="mm-kbd">{m.shortcut}</kbd>}
        {radio && m.checked && <Icon name="check" />}
        {m.submenu && <Icon name="chevron" />}
      </button>
    );
    if (!m.submenu) return body;
    return (
      <div className="mm-sub" key={m.label}>
        {body}
        {sub === m.label && (
          <div className="mm-menu mm-nested" role="menu" aria-label={m.label}>
            {m.submenu.map((s) => renderItem(s, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mm" ref={root} onKeyDown={onKey}>
      <div ref={btn} className="mm-btn">
        <IconButton
          label="Menu"
          shortcut={shortcut}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Icon name="menu" />
        </IconButton>
      </div>
      {open && (
        <div className="mm-menu" role="menu" aria-label="Main menu">
          {groups.map((g, gi) => (
            <div className="mm-group" role="none" key={gi}>
              {gi > 0 && <div className="mm-sep" role="separator" />}
              {g.map((m) => renderItem(m, false))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
