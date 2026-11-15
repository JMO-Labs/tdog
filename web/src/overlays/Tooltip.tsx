import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
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
  // Keep the tip on screen: shift it in from the viewport edges (8px margin).
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const t = tipRef.current;
    if (!pos || !t) return setShift(0);
    const r = t.getBoundingClientRect();
    const half = r.width / 2;
    const max = window.innerWidth - 8;
    setShift(
      pos.x + half > max
        ? max - (pos.x + half)
        : Math.max(0, 8 - (pos.x - half)),
    );
  }, [pos, label]);
  const p = children.props;
  const trigger = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      ref.current = el;
      const c = children as unknown as {
        ref?: unknown;
        props: { ref?: unknown };
      };
      const own = c.props.ref ?? c.ref; // React 19 prop, else legacy element ref
      if (typeof own === "function") own(el);
      else if (own && typeof own === "object")
        (own as { current: HTMLElement | null }).current = el;
    },
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
            ref={tipRef}
            role="tooltip"
            className="tip"
            style={{
              left: pos.x + shift,
              top: pos.y,
              transform: "translateX(-50%)",
            }}
          >
            {label}
            {shortcut && <kbd>{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}
