import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../shell/icons";
import { useToast } from "../overlays/toast";
import { displayTitle, titleStore } from "../terminal/titles";
import { copyBoth, copyCommand, copyOutput, jumpTo } from "./jump";
import { compile, type Hit } from "./search";
import { useJournalSearch } from "./useJournalSearch";
import "./search.css";

type Props = {
  open: boolean;
  onClose: () => void;
  scenes: { id: string; name: string }[];
  leafMap: Record<string, string[]>;
  /** History sync on: the empty state skips the "turn on sync" hint. */
  syncOn?: boolean;
};
type Group = { label: string; panes: { label: string; hits: Hit[] }[] };

const OTHER = "Other sessions";

export function rel(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const u: [number, string][] = [
    [60, "m"],
    [60, "h"],
    [24, "d"],
  ];
  let n = s / 60;
  let i = 0;
  while (i < u.length - 1 && n >= u[i + 1][0]) n /= u[++i][0];
  return `${Math.floor(n)}${u[i][1]} ago`;
}

function group(
  hits: Hit[],
  scenes: Props["scenes"],
  leafMap: Props["leafMap"],
): Group[] {
  const paneLabel = (p: string) => displayTitle(titleStore.get(p), p);
  const out: Group[] = [];
  const seen = new Set<string>();
  for (const sc of scenes) {
    const panes = (leafMap[sc.id] ?? [])
      .map((p) => ({ p, hits: hits.filter((h) => h.pane === p) }))
      .filter((x) => x.hits.length);
    panes.forEach((x) => seen.add(x.p));
    if (panes.length)
      out.push({
        label: sc.name,
        panes: panes.map((x) => ({ label: paneLabel(x.p), hits: x.hits })),
      });
  }
  const rest = hits.filter((h) => !seen.has(h.pane));
  const ids = [...new Set(rest.map((h) => h.pane))];
  if (ids.length)
    out.push({
      label: OTHER,
      panes: ids.map((p) => ({
        label: paneLabel(p),
        hits: rest.filter((h) => h.pane === p),
      })),
    });
  return out;
}

function highlight(line: string, re: RegExp | null): ReactNode {
  if (!re) return line;
  const parts: ReactNode[] = [];
  let at = 0;
  re.lastIndex = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    parts.push(line.slice(at, m.index), <mark key={m.index}>{m[0]}</mark>);
    at = m.index + m[0].length;
  }
  return parts.length ? [...parts, line.slice(at)] : line;
}

const ACTIONS: [string, IconName, (h: Hit) => Promise<void>][] = [
  ["Copy command", "chevron", copyCommand],
  ["Copy output", "paste", copyOutput],
  ["Copy both", "copy", copyBoth],
];

export function SearchPanel(props: Props) {
  const { open, onClose, scenes, leafMap, syncOn = false } = props;
  const [text, setText] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCase] = useState(false);
  const [sel, setSel] = useState(0);
  const toast = useToast();
  // Remember who had focus when we open (render phase: before autoFocus).
  const was = useRef(false);
  const back = useRef<Element | null>(null);
  const list = useRef<HTMLDivElement>(null);
  if (open && !was.current) back.current = document.activeElement;
  was.current = open;
  const q = { text, regex, caseSensitive };
  const { hits, done } = useJournalSearch(q);
  const groups = useMemo(
    () => group(hits, scenes, leafMap),
    [hits, scenes, leafMap],
  );
  const flat = groups.flatMap((g) => g.panes.flatMap((p) => p.hits));
  const re = useMemo(() => compile(q), [text, regex, caseSensitive]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const cur = Math.min(sel, Math.max(0, flat.length - 1));
  const dismiss = () => {
    onClose();
    (back.current as HTMLElement | null)?.focus?.();
  };
  const go = (h: Hit) => {
    jumpTo(h);
    onClose(); // overlay opens in the pane; either way the panel is done
  };
  const copy = (h: Hit, f: (h: Hit) => Promise<void>) =>
    f(h).then(
      () => toast("success", "Copied"),
      () => toast("fail", "Copy failed"),
    );
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      dismiss();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      const to = Math.max(0, Math.min(flat.length - 1, cur + d));
      setSel(to);
      list.current
        ?.querySelectorAll("[role=option]")
        [to]?.scrollIntoView?.({ block: "nearest" });
    } else if (e.key === "Enter" && flat[cur]) {
      e.preventDefault();
      go(flat[cur]);
    }
  };
  let n = -1;
  // Portaled: dockview sashes inside .panes would otherwise sit above the panel.
  return createPortal(
    <div className="sp-backdrop" onClick={dismiss}>
      <div
        className="sp float"
        role="dialog"
        aria-label="Search history"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="sp-bar">
          <input
            role="searchbox"
            autoFocus
            placeholder="Search command history…"
            aria-label="Search query"
            value={text}
            onChange={(e) => (setText(e.target.value), setSel(0))}
          />
          <button
            aria-pressed={regex}
            title="Regular expression"
            onClick={() => setRegex(!regex)}
          >
            .*
          </button>
          <button
            aria-pressed={caseSensitive}
            title="Match case"
            onClick={() => setCase(!caseSensitive)}
          >
            Aa
          </button>
        </div>
        <div ref={list} className="sp-list" role="listbox" aria-label="Matches">
          {groups.map((g) => (
            <Fragment key={g.label}>
              {g.panes.map((p) => (
                <div
                  key={p.label + p.hits[0].pane}
                  role="group"
                  aria-label={`${g.label} › ${p.label}`}
                  className="sp-group"
                >
                  <div className="sp-head">
                    {g.label} <span aria-hidden="true">›</span> {p.label}
                  </div>
                  {p.hits.map((h) => {
                    const i = ++n;
                    return (
                      <div
                        key={`${h.pane}/${h.rkey}/${h.lineNo}`}
                        role="option"
                        aria-selected={i === cur}
                        className="sp-hit"
                        onMouseMove={() => i !== cur && setSel(i)}
                        onClick={() => go(h)}
                      >
                        <div className="sp-top">
                          <code className="sp-cmd">{h.cmd}</code>
                          <span className="sp-time">{rel(h.at)}</span>
                          {h.exit !== undefined && (
                            <span className={`sp-exit${h.exit ? " bad" : ""}`}>
                              exit {h.exit}
                            </span>
                          )}
                          <span className="sp-acts">
                            {ACTIONS.map(([label, icon, f]) => (
                              <button
                                key={label}
                                aria-label={label}
                                title={label}
                                onClick={(e) => (
                                  e.stopPropagation(),
                                  copy(h, f)
                                )}
                              >
                                <Icon name={icon} />
                              </button>
                            ))}
                          </span>
                        </div>
                        <div className="sp-line">{highlight(h.line, re)}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </Fragment>
          ))}
          {done && text.trim() && !flat.length && (
            <div className="sp-empty">
              <p>No matches in this browser's history.</p>
              {!syncOn && (
                <p>Turn on history sync in Settings to search other devices.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
