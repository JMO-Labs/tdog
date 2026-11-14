import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ENTER, EXIT, pickVariant } from "../motion/variants";
import "./overlays.css";

export type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Hide the visible title (still used as aria-label). */
  hideTitle?: boolean;
};

/** Shared base for Dialog and Sheet: portal, backdrop, Esc, motion-kit enter/exit. */
export function Modal({
  open,
  title,
  onClose,
  children,
  hideTitle,
  className,
  sheet,
}: ModalProps & { className: string; sheet?: boolean }) {
  const reduced = !!useReducedMotion();
  const [pair] = useState(() => ({
    enter: pickVariant(ENTER, false),
    exit: pickVariant(EXIT, false),
  }));
  const enter = reduced ? pickVariant(ENTER, true) : pair.enter;
  const exit = reduced ? pickVariant(EXIT, true) : pair.exit;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && !ref.current?.contains(document.activeElement))
      ref.current?.focus();
  }, [open]);
  // Sheets slide in from the right; the dialog uses a random pop.
  const initial = sheet
    ? { x: "100%", opacity: reduced ? 0 : 1 }
    : Object.fromEntries(
        Object.entries(enter.keyframes).map(([k, a]) => [k, a[0]]),
      );
  const animate = sheet ? { x: 0, opacity: 1 } : enter.keyframes;
  const exitAnim = sheet
    ? { x: "100%", opacity: reduced ? 0 : 1 }
    : {
        ...exit.keyframes,
        transition: { duration: exit.duration, times: exit.times },
      };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="bd"
          className="overlay-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={className}
            initial={initial}
            animate={animate}
            exit={exitAnim}
            transition={
              sheet
                ? { type: "spring", stiffness: 380, damping: 30 }
                : { duration: enter.duration, times: enter.times }
            }
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
              }
            }}
          >
            {!hideTitle && <h2 className="overlay-title">{title}</h2>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
