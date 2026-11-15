import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import { fuzzyMatch } from "./commands";
import { THEMES, type Theme } from "../theme/registry";
import { fontFamily, loadFont } from "../theme/fonts";
import { themeStore } from "../theme/store";
import "./themePicker.css";

/** Quiet period after the last scroll before a hover/focus previews. */
export const PREVIEW_DELAY = 150;
const FALLBACK_COLS = 3;

/** One mini terminal, painted only from the theme's own data. */
function Card({
  t,
  selected,
  onHover,
  onPick,
}: {
  t: Theme;
  selected: boolean;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
}) {
  const { palette, cursor, font } = t.terminal;
  useEffect(() => void loadFont(font).catch(() => {}), [font]);
  const style: Record<string, string> = {
    "--c-bg": palette.bg,
    "--c-fg": palette.fg,
    "--c-cursor": palette.cursor,
    "--c-font": fontFamily(font),
    "--c-pattern": themeStore.backdrop(t.id),
  };
  palette.ansi.forEach((c, i) => (style[`--c-ansi-${i}`] = c));
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-theme-id={t.id}
      data-selected={selected || undefined}
      className="tp-card"
      style={style}
      onPointerEnter={() => onHover(t.id)}
      onPointerLeave={() => onHover(null)}
      onClick={() => onPick(t.id)}
    >
      <span className="tp-term" aria-hidden="true">
        <span className="tp-pat" />
        <span className="tp-line">
          <span style={{ color: "var(--c-ansi-2)" }}>~</span> ls
        </span>
        <span className="tp-line">
          <span style={{ color: "var(--c-ansi-4)" }}>src</span>{" "}
          <span style={{ color: "var(--c-ansi-1)" }}>err</span>{" "}
          <span style={{ color: "var(--c-ansi-3)" }}>warn</span>
        </span>
        <span className="tp-line">
          <span style={{ color: "var(--c-ansi-5)" }}>$</span>{" "}
          <span className={`tp-cursor ${cursor.shape}`} />
        </span>
        <span className="tp-ansi">
          {palette.ansi.slice(0, 8).map((_, i) => (
            <i key={i} style={{ background: `var(--c-ansi-${i})` }} />
          ))}
        </span>
      </span>
      <span className="tp-name">{t.name}</span>
    </button>
  );
}

export function ThemePicker({
  open,
  pane,
  onClose,
}: {
  open: boolean;
  /** Focused pane that previews; none means no live preview. */
  pane?: string | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<string>(() => themeStore.get().id);
  const [hover, setHover] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(0);

  const groups = useMemo(() => {
    const m = THEMES.filter((t) => fuzzyMatch(query, t.name));
    return [
      { label: "Dark", items: m.filter((t) => t.appearance === "dark") },
      { label: "Light", items: m.filter((t) => t.appearance === "light") },
    ].filter((g) => g.items.length);
  }, [query]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Keep the selection inside the filtered list.
  const cur = flat.some((t) => t.id === sel) ? sel : flat[0]?.id;
  const target = hover ?? cur ?? null;

  const markScrolling = useCallback(() => setScrolls((n) => n + 1), []);

  // Preview the hovered/focused theme once 150 ms pass with no scrolling.
  useEffect(() => {
    if (!open || !target || !pane) return;
    const t = setTimeout(
      () => themeStore.previewPane(pane, target),
      PREVIEW_DELAY,
    );
    return () => clearTimeout(t);
  }, [open, target, scrolls, pane]);
  // Closing (or unmounting) always drops the preview.
  useEffect(() => {
    if (!open) return;
    return () => themeStore.previewPane(null, null);
  }, [open]);

  const close = () => {
    themeStore.previewPane(null, null);
    setQuery("");
    setHover(null);
    onClose();
  };
  const pick = (id: string) => {
    themeStore.previewPane(null, null);
    themeStore.select(id);
    close();
  };
  const move = (to: string | undefined) => {
    if (!to) return;
    setHover(null);
    setSel(to);
    requestAnimationFrame?.(() =>
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-theme-id="${to}"]`)
        ?.focus({ preventScroll: false }),
    );
  };
  const cols = () => {
    const grid = gridRef.current?.querySelector(".tp-grid");
    if (!grid) return FALLBACK_COLS;
    const tpl = getComputedStyle(grid).gridTemplateColumns;
    const n = tpl.split(" ").filter(Boolean).length;
    return n > 1 ? n : FALLBACK_COLS;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!flat.length) return;
    const i = flat.findIndex((t) => t.id === cur);
    const inInput = (e.target as HTMLElement).tagName === "INPUT";
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: cols(),
      ArrowUp: -cols(),
    };
    const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (e.key in step && !(inInput && horizontal)) {
      e.preventDefault();
      move(flat[Math.min(flat.length - 1, Math.max(0, i + step[e.key]))]?.id);
    } else if (e.key === "Enter" && cur) {
      e.preventDefault();
      pick(cur);
    }
  };

  return (
    <Modal
      open={open}
      title="Theme"
      onClose={close}
      closable
      className="dialog theme-picker"
    >
      <div onKeyDown={onKeyDown}>
        <input
          className="input"
          type="search"
          role="searchbox"
          placeholder="Filter by name"
          aria-label="Filter themes"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        <div
          ref={gridRef}
          role="listbox"
          aria-label="Themes"
          data-testid="theme-grid"
          className="tp-scroll"
          onWheel={markScrolling}
          onScroll={markScrolling}
          onTouchMove={markScrolling}
        >
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <h3 className="tp-group">{g.label}</h3>
              <div className="tp-grid">
                {g.items.map((t) => (
                  <Card
                    key={t.id}
                    t={t}
                    selected={t.id === cur}
                    onHover={setHover}
                    onPick={pick}
                  />
                ))}
              </div>
            </div>
          ))}
          {!groups.length && <p className="tp-empty">No matching themes.</p>}
        </div>
      </div>
    </Modal>
  );
}
