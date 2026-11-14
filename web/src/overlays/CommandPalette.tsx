import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Modal } from "./Modal";
import { fuzzyMatch, getCommands, subscribeCommands } from "./commands";

export function CommandPalette({
  defaultOpen = false,
  open: controlled,
  onOpenChange,
}: {
  defaultOpen?: boolean;
  /** Controlled mode: pass both to let a parent open the palette. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ?? inner;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(openRef.current) : v;
    setInner(next);
    onOpenChange?.(next);
  };
  const openRef = useRef(open);
  openRef.current = open;
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const all = useSyncExternalStore(subscribeCommands, getCommands);
  const list = useMemo(
    () => all.filter((c) => fuzzyMatch(query, c.title)),
    [all, query],
  );
  const close = () => {
    setOpen(false);
    setQuery("");
    setSel(0);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const hl = open ? list[sel] : undefined;
  useEffect(() => {
    hl?.preview?.();
    return () => hl?.revert?.();
  }, [hl]);
  const run = (i: number) => {
    const c = list[i];
    if (!c) return;
    close();
    c.run();
  };
  return (
    <Modal
      open={open}
      title="Command palette"
      hideTitle
      onClose={close}
      className="dialog cmdk"
    >
      <input
        className="input"
        role="combobox"
        aria-expanded="true"
        aria-controls="cmdk-list"
        aria-activedescendant={list[sel] ? `cmdk-${list[sel].id}` : undefined}
        placeholder="Type a command…"
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(list.length - 1, s + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(sel);
          }
        }}
      />
      <ul id="cmdk-list" role="listbox">
        {list.map((c, i) => (
          <li
            key={c.id}
            id={`cmdk-${c.id}`}
            role="option"
            aria-selected={i === sel}
            onMouseMove={() => setSel(i)}
            onClick={() => run(i)}
          >
            {c.title}
            {c.shortcut && <kbd>{c.shortcut}</kbd>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
