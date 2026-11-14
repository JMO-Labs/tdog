import { useEffect, useRef, useState } from "react";
import { IconButton } from "../components/ui/button";
import { Icon, type IconName } from "./icons";

export type OverflowItem = {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
};

/** `⋯` button with a small popup menu; closes on Escape or outside press. */
export function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const press = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", press);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", press);
    };
  }, [open]);
  return (
    <div className="ovf" ref={ref}>
      <IconButton
        label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
      </IconButton>
      {open && (
        <div className="ovf-menu" role="menu">
          {items.map((i) => (
            <button
              key={i.label}
              role="menuitem"
              className={i.danger ? "danger" : undefined}
              onClick={() => {
                setOpen(false);
                i.onSelect();
              }}
            >
              <Icon name={i.icon} />
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
