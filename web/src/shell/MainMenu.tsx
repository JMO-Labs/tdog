import { useRef, useState } from "react";
import { IconButton } from "../components/ui/button";
import { ActionMenu, type MenuItem } from "../components/menu/ActionMenu";
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

const toMenuItem = (entry: MenuEntry): MenuItem => ({
  label: entry.label,
  icon: entry.icon,
  shortcut: entry.shortcut,
  disabled: entry.disabled,
  checked: entry.checked,
  isRadio: entry.checked !== undefined,
  onSelect: entry.onSelect,
  submenu: entry.submenu?.map(toMenuItem),
});

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
  const container = useRef<HTMLDivElement>(null);

  const handleDismiss = () => {
    setOpen(false);
    const btn = container.current?.querySelector("button");
    btn?.focus();
  };

  const getPos = () => {
    const btn = container.current?.querySelector<HTMLElement>("button");
    const rect = btn?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: rect.right - 200,
      y: rect.bottom + 4,
    };
  };

  if (!open) {
    return (
      <div ref={container} className="mm">
        <IconButton
          label="Menu"
          shortcut={shortcut}
          aria-haspopup="menu"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" />
        </IconButton>
      </div>
    );
  }

  const pos = getPos();
  const menuItems = groups.map((g) => g.map(toMenuItem));

  return (
    <>
      <div ref={container} className="mm">
        <IconButton
          label="Menu"
          shortcut={shortcut}
          aria-haspopup="menu"
          aria-expanded
          onClick={() => setOpen(false)}
        >
          <Icon name="menu" />
        </IconButton>
      </div>
      <ActionMenu
        x={pos.x}
        y={pos.y}
        groups={menuItems}
        onDismiss={handleDismiss}
        ariaLabel="Main menu"
      />
    </>
  );
}
