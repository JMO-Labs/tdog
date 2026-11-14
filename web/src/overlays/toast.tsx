import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ENTER, EXIT, pickVariant } from "../motion/variants";
import "./overlays.css";

export type ToastKind = "success" | "fail" | "warn" | "info";

// From SLANG in docs/design/mockup.js. Info has no pool: it falls back to success.
export const SLANG: Record<Exclude<ToastKind, "info">, string[]> = {
  success: [
    "Radical!",
    "Bodacious!",
    "Booyah!",
    "All that and a bag of chips",
    "Da bomb",
    "Phat!",
  ],
  fail: [
    "Bummer.",
    "As if!",
    "Not!",
    "Talk to the hand",
    "Psych!",
    "Whatever.",
  ],
  warn: ["Whoa.", "Duuude.", "Don't have a cow"],
};

export function pickHeadline(
  kind: ToastKind,
  serious: boolean,
  rng: () => number = Math.random,
): string {
  if (serious) return "";
  const pool = SLANG[kind === "info" ? "success" : kind];
  return pool[Math.floor(rng() * pool.length)];
}

type Item = {
  id: number;
  kind: ToastKind;
  detail: string;
  head: string;
  tilt: number;
};
type Fire = (kind: ToastKind, detail: string, head?: string) => void;

const Ctx = createContext<Fire>(() => {});
export const useToast = () => useContext(Ctx);

const LIFETIME_MS = 4200;

export function ToastProvider({
  children,
  serious = false,
}: {
  children: ReactNode;
  /** Serious mode drops the slang headline. */
  serious?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(0);
  const reduced = !!useReducedMotion();
  const [pair] = useState(() => ({
    enter: pickVariant(ENTER, false),
    exit: pickVariant(EXIT, false),
  }));
  const enter = reduced ? pickVariant(ENTER, true) : pair.enter;
  const exit = reduced ? pickVariant(EXIT, true) : pair.exit;
  const dismiss = useCallback(
    (id: number) => setItems((l) => l.filter((t) => t.id !== id)),
    [],
  );
  const fire = useCallback<Fire>(
    (kind, detail, head) => {
      const id = next.current++;
      const h = serious ? "" : (head ?? pickHeadline(kind, false));
      setItems((l) => [
        ...l,
        {
          id,
          kind,
          detail,
          head: h,
          tilt: +(Math.random() * 6 - 3).toFixed(1),
        },
      ]);
      setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [serious, dismiss],
  );
  return (
    <Ctx.Provider value={fire}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              className={`toast ${t.kind}`}
              style={{ rotate: `${t.tilt}deg` }}
              initial={Object.fromEntries(
                Object.entries(enter.keyframes).map(([k, a]) => [k, a[0]]),
              )}
              animate={enter.keyframes}
              exit={{
                ...exit.keyframes,
                transition: { duration: exit.duration, times: exit.times },
              }}
              transition={{ duration: enter.duration, times: enter.times }}
              onClick={() => dismiss(t.id)}
            >
              {t.head && <b>{t.head}</b>}
              <p>{t.detail}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
