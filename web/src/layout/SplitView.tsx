import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  SplitviewReact,
  type ISplitviewPanelProps,
  type SplitviewReadyEvent,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { Icon } from "../shell/icons";
import { mountSplit, orientation } from "./dock";
import type { Dir, Node } from "./tree";
import "./layout.css";

export interface SplitViewProps {
  tree: Node;
  onSplit: (id: string, dir: Dir) => void;
  onClose: (id: string) => void;
  onRatio: (splitId: string, ratio: number) => void;
  /** `settled` is false while a sash drag / resize is still moving. */
  renderPane: (id: string, settled: boolean) => ReactNode;
}

/** Quiet time after the last relayout before terminals refit. */
export const SETTLE_MS = 150;

type Shared = { p: SplitViewProps; settled: boolean; busy: () => void };
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
  const shared = { p: props, settled, busy };
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
  const { p, settled } = useContext(SharedCtx)!;
  return (
    <section className="pane" data-pane={id}>
      <header className="pane-head">
        <span className="spacer" />
        <button
          className="pane-btn"
          aria-label="Split right"
          title="Split right"
          onClick={() => p.onSplit(id, "row")}
        >
          <Icon name="splitRight" />
        </button>
        <button
          className="pane-btn"
          aria-label="Split down"
          title="Split down"
          onClick={() => p.onSplit(id, "col")}
        >
          <Icon name="splitDown" />
        </button>
        <button
          className="pane-btn danger"
          aria-label="Close pane"
          title="Close pane (kills the shell)"
          onClick={() => p.onClose(id)}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="pane-body">{p.renderPane(id, settled)}</div>
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
