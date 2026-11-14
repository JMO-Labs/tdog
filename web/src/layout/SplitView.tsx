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
import { leaves } from "./tree";
import { mountSplit, orientation } from "./dock";
import type { Dir, Node } from "./tree";
import { PaneMenu } from "./PaneMenu";
import { SnapPicker } from "./SnapPicker";
import type { TemplateId } from "./templates";
import "./layout.css";

export interface SplitViewProps {
  tree: Node;
  onSplit: (id: string, dir: Dir) => void;
  onClose: (id: string) => void;
  onSnap: (t: TemplateId, confirmed?: boolean) => string[];
  onRatio: (splitId: string, ratio: number) => void;
  /** Other scenes a pane can move to (keyboard alternative to dragging). */
  scenes?: { id: string; name: string }[];
  onMove?: (id: string, target: string, zone: Zone) => void;
  onSwap?: (id: string, delta: 1 | -1) => void;
  onMoveToScene?: (id: string, scene: string) => void;
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
  const shared = { p: props, settled, busy, order, focus, setFocus };
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
  const { p, settled, order, focus, setFocus } = useContext(SharedCtx)!;
  const [zone, setZone] = useState<Zone | null>(null);
  const title = usePaneTitle(id, `Shell ${order.indexOf(id) + 1}`);
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
        <span className="title" data-testid="pane-title">
          {title}
        </span>
        {/* Panes are always local PTYs for now (no remote targets in spec). */}
        <span className="chip">local</span>
        <span className="spacer" />
        <SnapPicker onSnap={p.onSnap} />
        {p.onSwap && p.onMoveToScene && (
          <PaneMenu
            id={id}
            scenes={p.scenes ?? []}
            onSwap={p.onSwap}
            onMoveToScene={p.onMoveToScene}
          />
        )}
        <button
          className="pane-btn icon-btn sm"
          aria-label="Split right"
          title="Split right"
          onClick={() => p.onSplit(id, "row")}
        >
          <Icon name="splitRight" />
        </button>
        <button
          className="pane-btn icon-btn sm"
          aria-label="Split down"
          title="Split down"
          onClick={() => p.onSplit(id, "col")}
        >
          <Icon name="splitDown" />
        </button>
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
        {p.renderPane(id, settled)}
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
