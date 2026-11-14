import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Modal } from "./Modal";
import { fuzzyMatch, getCommands, subscribeCommands } from "./commands";

export function CommandPalette({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
