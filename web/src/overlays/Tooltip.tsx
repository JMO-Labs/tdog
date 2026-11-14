import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type HTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { tooltipController } from "./tooltipDelay";
import "./overlays.css";

type Props = {
  label: string;
  shortcut?: string;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
};

/** Wrap any icon-only control. 400 ms delay, instant between neighbours. */
export function Tooltip({ label, shortcut, children }: Props) {
  const id = useId();
  const ref = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = () =>
    tooltipController.enter(id, () => {
      const r = ref.current?.getBoundingClientRect();
      setPos(r ? { x: r.left + r.width / 2, y: r.bottom + 8 } : { x: 0, y: 0 });
    });
  const hide = () => tooltipController.leave(id, () => setPos(null));
  useEffect(() => hide, []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = children.props;
  const trigger = cloneElement(children, {
    ref: (el: HTMLElement | null) => (ref.current = el),
    "aria-label": p["aria-label"] ?? label,
    onMouseEnter: (e: never) => (p.onMouseEnter?.(e), show()),
    onMouseLeave: (e: never) => (p.onMouseLeave?.(e), hide()),
    onFocus: (e: never) => (p.onFocus?.(e), show()),
    onBlur: (e: never) => (p.onBlur?.(e), hide()),
  } as HTMLAttributes<HTMLElement>);
  return (
    <>
      {trigger}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="tip"
            style={{ left: pos.x, top: pos.y, transform: "translateX(-50%)" }}
          >
            {label}
            {shortcut && <kbd>{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}
