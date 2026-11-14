import { useState, type ReactNode } from "react";
import { Icon } from "../shell/icons";
import type { Dir, Node } from "./tree";
import "./layout.css";

export interface SplitViewProps {
  tree: Node;
  onSplit: (id: string, dir: Dir) => void;
  onClose: (id: string) => void;
  onRatio: (splitId: string, ratio: number) => void;
  /** `settled` is false while a divider is being dragged. */
  renderPane: (id: string, settled: boolean) => ReactNode;
}

export function SplitView(props: SplitViewProps) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="split-root">
      <NodeView
        n={props.tree}
        p={props}
        settled={!dragging}
        drag={setDragging}
      />
    </div>
  );
}

function NodeView({
  n,
  p,
  settled,
  drag,
}: {
  n: Node;
  p: SplitViewProps;
  settled: boolean;
  drag: (d: boolean) => void;
}) {
  if (n.t === "leaf") {
    return (
      <section className="pane" data-pane={n.id}>
        <header className="pane-head">
          <span className="spacer" />
          <button
            className="pane-btn"
            aria-label="Split right"
            title="Split right"
            onClick={() => p.onSplit(n.id, "row")}
          >
            <Icon name="splitRight" />
          </button>
          <button
            className="pane-btn"
            aria-label="Split down"
            title="Split down"
            onClick={() => p.onSplit(n.id, "col")}
          >
            <Icon name="splitDown" />
          </button>
          <button
            className="pane-btn danger"
            aria-label="Close pane"
            title="Close pane (kills the shell)"
            onClick={() => p.onClose(n.id)}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="pane-body">{p.renderPane(n.id, settled)}</div>
      </section>
    );
  }
  const row = n.dir === "row";
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.dataset.drag = "1";
    drag(true);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.dataset.drag) return;
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    const ratio = row
      ? (e.clientX - box.left) / box.width
      : (e.clientY - box.top) / box.height;
    p.onRatio(n.id, ratio);
  };
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    delete e.currentTarget.dataset.drag;
    drag(false);
  };
  return (
    <div className={`split ${n.dir}`} data-testid={`split-${n.id}`}>
      <div className="split-cell" style={{ flex: `${n.ratio} 1 0` }}>
        <NodeView n={n.a} p={p} settled={settled} drag={drag} />
      </div>
      <div
        className="divider"
        role="separator"
        aria-orientation={row ? "vertical" : "horizontal"}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="split-cell" style={{ flex: `${1 - n.ratio} 1 0` }}>
        <NodeView n={n.b} p={p} settled={settled} drag={drag} />
      </div>
    </div>
  );
}
