import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Modal } from "./Modal";
import {
  getCommands,
  getRecents,
  groupCommands,
  matchIndices,
  recordRecent,
  subscribeCommands,
  type Command,
} from "./commands";

function Highlight({ text, query }: { text: string; query: string }) {
  const idx = new Set(matchIndices(query, text) ?? []);
  if (!idx.size) return <>{text}</>;
  return (
    <>
      {[...text].map((ch, i) => (idx.has(i) ? <mark key={i}>{ch}</mark> : ch))}
    </>
  );
}

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
  const [recents, setRecents] = useState<string[]>(getRecents);
  useEffect(() => {
    if (open) setRecents(getRecents());
  }, [open]);
  const sections = useMemo(
    () => groupCommands(all, query, recents),
    [all, query, recents],
  );
  const list: Command[] = useMemo(
    () => sections.flatMap((s) => s.items),
    [sections],
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
    recordRecent(c.id);
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
        {sections.map((sec) => (
          <li key={sec.heading} role="presentation" className="cmdk-group">
            <div className="cmdk-heading">{sec.heading}</div>
            <ul role="group" aria-label={sec.heading}>
              {sec.items.map((c) => {
                const i = list.indexOf(c);
                return (
                  <li
                    key={c.id}
                    id={`cmdk-${c.id}`}
                    role="option"
                    aria-selected={i === sel}
                    onMouseMove={() => setSel(i)}
                    onClick={() => run(i)}
                  >
                    <span className="cmdk-title">
                      {c.swatch && (
                        <span className="swatch" aria-hidden="true">
                          {c.swatch.map((col, k) => (
                            <i key={k} style={{ background: col }} />
                          ))}
                        </span>
                      )}
                      <Highlight text={c.title} query={query} />
                    </span>
                    {c.shortcut && <kbd>{c.shortcut}</kbd>}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
        {list.length === 0 && (
          <li role="presentation" className="cmdk-empty">
            No commands match ‘{query}’.
          </li>
        )}
      </ul>
    </Modal>
  );
}
