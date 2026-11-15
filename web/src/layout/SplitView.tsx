import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  SplitviewReact,
  type ISplitviewPanelProps,
  type SplitviewReadyEvent,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { usePaneTitle } from "../terminal/titles";
import { Icon } from "../shell/icons";
import { PANE_MIME, dragPane, draggedPane, dropZone, type Zone } from "./dnd";
import { leaves, paneTitle, titles } from "./tree";
import { clearScrollback } from "../terminal/paneActions";
import { registerCommand } from "../overlays/commands";
import { mountSplit, orientation } from "./dock";
import type { Dir, Node } from "./tree";
import { PaneOpsContext } from "./paneOps";
import { PaneMenu } from "./PaneMenu";
import { TEMPLATES, type TemplateId } from "./templates";
import { useBroadcast } from "../broadcast/useBroadcast";
import "./layout.css";

export interface SplitViewProps {
  tree: Node;
  sceneId?: string;
  onSplit: (id: string, dir: Dir) => void;
  onClose: (id: string) => void;
  onSnap: (t: TemplateId, confirmed?: boolean) => string[];
  onRatio: (splitId: string, ratio: number) => void;
  /** Other scenes a pane can move to (keyboard alternative to dragging). */
  scenes?: { id: string; name: string }[];
  onMove?: (id: string, target: string, zone: Zone) => void;
  onSwap?: (id: string, delta: 1 | -1) => void;
  onMoveToScene?: (id: string, scene: string) => void;
  onRename?: (id: string, title: string) => void;
  onDuplicate?: (id: string) => void;
  /** Only the visible scene registers ⌘K pane commands. */
  active?: boolean;
  /** `settled` is false while a sash drag / resize is still moving. */
  renderPane: (id: string, settled: boolean) => ReactNode;
}

/** Quiet time after the last relayout before terminals refit. */
export const SETTLE_MS = 150;

type Shared = {
  p: SplitViewProps;
  settled: boolean;
  busy: () => void;
  order: string[];
  names: Record<string, string>;
  focus: string | null;
  setFocus: (id: string) => void;
};
const SharedCtx = createContext<Shared | null>(null);
/** Children of the enclosing split, read by dockview panels "a" and "b". */
const KidsCtx = createContext<{ a: Node; b: Node } | null>(null);

/** Split tree rendered with nested dockview splitviews (ADR-0004). */
export function SplitView(props: SplitViewProps) {
  const [settled, setSettled] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const busy = useCallback(() => {
    setSettled(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSettled(true), SETTLE_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [focus, setFocus] = useState<string | null>(null);
  const order = useMemo(() => leaves(props.tree), [props.tree]);
  const names = useMemo(() => titles(props.tree), [props.tree]);
  const shared = { p: props, settled, busy, order, names, focus, setFocus };
  return (
    <SharedCtx.Provider value={shared}>
      <div className="split-root">
        <NodeView n={props.tree} />
      </div>
    </SharedCtx.Provider>
  );
}

function NodeView({ n }: { n: Node }) {
  return n.t === "leaf" ? <Pane id={n.id} /> : <Split key={n.id} n={n} />;
}

function Pane({ id }: { id: string }) {
  const { p, settled, order, names, focus, setFocus } = useContext(SharedCtx)!;
  const [zone, setZone] = useState<Zone | null>(null);
  const title = usePaneTitle(
    id,
    paneTitle(undefined, undefined, order.indexOf(id)),
  );
  const [renaming, setRenaming] = useState(false);
  const clear = useCallback(() => void clearScrollback(id), [id]);
  const live = useRef(p);
  live.current = p;
  const isFocused = focus === id && p.active !== false;

  const broadcast =
    p.sceneId && isFocused ? useBroadcast(p.sceneId, id) : null;

  // ⌘K actions target the focused pane of the visible scene.
  useEffect(() => {
    if (!isFocused) return;
    const cmd = (key: string, title: string, run: () => void) =>
      registerCommand({ id: `pane:${key}`, title: `Pane: ${title}`, run });
    const offs = [
      cmd("rename", "Rename", () => setRenaming(true)),
      cmd("duplicate", "Duplicate", () => live.current.onDuplicate?.(id)),
      cmd("clear", "Clear scrollback", clear),
      cmd("swap-prev", "Swap with previous", () =>
        live.current.onSwap?.(id, -1),
      ),
      cmd("swap-next", "Swap with next", () => live.current.onSwap?.(id, 1)),
      cmd("close", "Close", () => live.current.onClose(id)),
      cmd("split-right", "Split right", () => live.current.onSplit(id, "row")),
      cmd("split-down", "Split down", () => live.current.onSplit(id, "col")),
      ...(broadcast
        ? [
            cmd("broadcast:toggle", "Broadcast to all panes in scene", () =>
              broadcast.toggle(),
            ),
          ]
        : []),
      ...TEMPLATES.map((t) =>
        cmd(`layout:${t.id}`, `Layout ${t.label}`, () => {
          const n = live.current.onSnap(t.id).length;
          if (
            n &&
            window.confirm(`Close ${n} pane${n > 1 ? "s" : ""} and apply?`)
          )
            live.current.onSnap(t.id, true);
        }),
      ),
      ...(live.current.scenes ?? []).map((s) =>
        registerCommand({
          id: `pane:move:${s.id}`,
          title: `Pane: Move to scene ${s.name}`,
          run: () => live.current.onMoveToScene?.(id, s.id),
        }),
      ),
    ];
    return () => offs.forEach((f) => f());
  }, [isFocused, id, clear, p.scenes, broadcast]);
  const over = (e: DragEvent<HTMLElement>) => {
    const d = draggedPane();
    if (!d || !p.onMove) {
      setZone(null);
      return;
    }
    e.preventDefault();
    setZone(
      d === id
        ? null
        : dropZone(
            e.clientX,
            e.clientY,
            e.currentTarget.getBoundingClientRect(),
          ),
    );
  };
  return (
    <section
      className="pane"
      data-pane={id}
      data-focused={focus === id}
      onFocusCapture={() => setFocus(id)}
      onPointerDownCapture={() => setFocus(id)}
      onDragOver={over}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Element | null))
          setZone(null);
      }}
      onDrop={(e) => {
        const d = draggedPane();
        const z =
          d && d !== id
            ? dropZone(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
              )
            : null;
        setZone(null);
        if (!d || !z || !p.onMove) return;
        e.preventDefault();
        p.onMove(d, id, z);
      }}
    >
      <header
        className="pane-head"
        draggable={!!p.onMove}
        onDragStart={(e) => {
          e.dataTransfer.setData(PANE_MIME, id);
          e.dataTransfer.effectAllowed = "move";
          dragPane(id);
        }}
        onDragEnd={() => {
          dragPane(null);
          setZone(null);
        }}
      >
        {renaming ? (
          <input
            className="pane-title-input"
            aria-label="Pane name"
            autoFocus
            defaultValue={names[id] ?? ""}
            placeholder={paneTitle(undefined, undefined, order.indexOf(id))}
            draggable={false}
            onBlur={(e) => {
              if (!e.currentTarget.dataset.cancel)
                p.onRename?.(id, e.currentTarget.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                e.currentTarget.dataset.cancel = "1";
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="title" data-testid="pane-title">
            {paneTitle(names[id], title, order.indexOf(id))}
          </span>
        )}
        {/* Panes are always local PTYs for now (no remote targets in spec). */}
        <span className="chip">local</span>
        {broadcast?.isBroadcasting && (
          <span className="chip broadcast">Broadcasting</span>
        )}
        <span className="spacer" />
        <button
          className="pane-btn pane-split icon-btn sm"
          aria-label="Split right"
          title="Split right"
          onClick={() => p.onSplit(id, "row")}
        >
          <Icon name="splitRight" />
        </button>
        <button
          className="pane-btn pane-split icon-btn sm"
          aria-label="Split down"
          title="Split down"
          onClick={() => p.onSplit(id, "col")}
        >
          <Icon name="splitDown" />
        </button>
        {p.onSwap && p.onMoveToScene && (
          <PaneMenu
            id={id}
            scenes={p.scenes ?? []}
            onSwap={p.onSwap}
            onMoveToScene={p.onMoveToScene}
            onRename={p.onRename && (() => setRenaming(true))}
            onDuplicate={p.onDuplicate}
            onClear={clear}
            onClose={p.onClose}
            onSplit={p.onSplit}
            onSnap={p.onSnap}
          />
        )}
        <button
          className="pane-btn icon-btn sm danger"
          aria-label="Close pane"
          title="Close pane (kills the shell)"
          onClick={() => p.onClose(id)}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="pane-body">
        <PaneOpsContext.Provider
          value={{
            split: (d) => p.onSplit(id, d),
            rename: p.onRename && (() => setRenaming(true)),
            close: () => p.onClose(id),
          }}
        >
          {p.renderPane(id, settled)}
        </PaneOpsContext.Provider>
        {zone && (
          <div
            className="drop-zone"
            data-zone={zone}
            data-testid="drop-zone"
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  );
}

function Child(props: ISplitviewPanelProps) {
  const kids = useContext(KidsCtx)!;
  return <NodeView n={props.api.id === "a" ? kids.a : kids.b} />;
}
const components = { child: Child };

function Split({ n }: { n: Extract<Node, { t: "split" }> }) {
  const shared = useContext(SharedCtx)!;
  // dockview calls onReady once; read the latest callbacks through a ref.
  const live = useRef(shared);
  live.current = shared;
  const ready = useCallback(
    ({ api }: SplitviewReadyEvent) =>
      mountSplit(api, n.dir, n.ratio, (r) => {
        live.current.busy();
        live.current.p.onRatio(n.id, r);
      }),
    // Mounted once per split id (keyed); later ratios come from dockview.
    [],
  );
  const kids = useMemo(() => ({ a: n.a, b: n.b }), [n.a, n.b]);
  return (
    <div className="split" data-testid={`split-${n.id}`} data-dir={n.dir}>
      <KidsCtx.Provider value={kids}>
        <SplitviewReact
          orientation={orientation(n.dir)}
          components={components}
          onReady={ready}
        />
      </KidsCtx.Provider>
    </div>
  );
}
