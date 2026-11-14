import "./pet.css";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { PetEngine } from "./petEngine";
import { miniCells, petFrame } from "./petFrame";
import { drawLcd, drawMini } from "./petLcd";

export const PET_IDLE_MS = 3000;
const TICK_MS = 250;
const RM_QUERY = "(prefers-reduced-motion: reduce)";

/** True while output arrived within the last PET_IDLE_MS. `stamp` is bumped on each output. */
export function usePetAwake(stamp: number): boolean {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!stamp) return;
    setAwake(true);
    const t = setTimeout(() => setAwake(false), PET_IDLE_MS);
    return () => clearTimeout(t);
  }, [stamp]);
  return awake;
}

const mql = () =>
  typeof matchMedia === "function" ? matchMedia(RM_QUERY) : null;

function useReducedMotion(): boolean {
  const [rm, setRm] = useState(() => !!mql()?.matches);
  useEffect(() => {
    const mq = mql();
    if (!mq) return;
    const on = () => setRm(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return rm;
}

const BUTTONS = [
  ["A", "Feed"],
  ["B", "Play fetch"],
  ["C", "Clean up"],
] as const;

interface PetProps {
  awake: boolean;
  onHide: () => void;
  /** Meters, 0..4. */
  full?: number;
  happy?: number;
  /** Shows the pip on the mini egg. */
  attention?: boolean;
  /** Live behaviour engine; overrides awake/full/happy/attention. */
  engine?: PetEngine;
}

export function Pet({
  awake,
  onHide,
  full: fullProp = 3,
  happy: happyProp = 3,
  attention: attentionProp = false,
  engine,
}: PetProps) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const egg = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const lcd = useRef<HTMLCanvasElement>(null);
  const view = engine?.view();
  const full = view?.hunger ?? fullProp;
  const happy = view?.happy ?? happyProp;
  const attention = view?.attention ?? attentionProp;
  const frame = petFrame({ awake, tick, reduced, view });

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [reduced]);

  useEffect(() => {
    const m = mini.current?.getContext("2d");
    if (m) drawMini(m, miniCells(frame.mini, frame.eyes, frame.mouth));
    const l = open ? lcd.current?.getContext("2d") : null;
    if (l) drawLcd(l, frame.cells);
  });

  const close = () => {
    setOpen(false);
    egg.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLElement>("[data-pet]")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !egg.current?.contains(t)) close();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", down);
    };
  }, [open]);

  return (
    <>
      <button
        ref={egg}
        data-testid="pet"
        className={`pet-egg ${view ? (view.asleep ? "sleep" : "awake") : awake ? "awake" : "sleep"}${reduced ? " reduced" : ""}`}
        aria-label="Open Dogbert"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={frame.caption}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <canvas ref={mini} width={28} height={26} aria-hidden="true" />
        {attention && <span className="pet-pip" data-testid="pet-pip" />}
      </button>
      {open && (
        <div ref={pop} className="pet-pop" role="dialog" aria-label="Dogbert">
          <div className="pet-card">
            <div className="egg">
              <span className="egg-ring" aria-hidden="true" />
              <div className="egg-face">
                <p className="egg-brand" aria-hidden="true">
                  dogbert
                </p>
                <div className="lcd-wrap">
                  <canvas
                    ref={lcd}
                    className={view?.night ? "lcd dim" : "lcd"}
                    width={128}
                    height={96}
                    role="img"
                    aria-label={frame.caption}
                  />
                </div>
                <div className="egg-stats">
                  <span>Full</span>
                  <span
                    className="pips"
                    style={{ "--n": full } as CSSProperties}
                    role="meter"
                    aria-label="Full"
                    aria-valuemin={0}
                    aria-valuemax={4}
                    aria-valuenow={full}
                  />
                  <span>Happy</span>
                  <span
                    className="pips"
                    style={{ "--n": happy } as CSSProperties}
                    role="meter"
                    aria-label="Happy"
                    aria-valuemin={0}
                    aria-valuemax={4}
                    aria-valuenow={happy}
                  />
                </div>
              </div>
              <div className="egg-btns">
                {BUTTONS.map(([k, name]) => (
                  <button
                    key={k}
                    data-pet={k}
                    aria-label={name}
                    title={name}
                    onClick={() => {
                      engine?.press(k);
                      setTick((n) => n + 1);
                    }}
                  >
                    <span aria-hidden="true">{k}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="pet-cap" data-testid="pet-cap" aria-live="polite">
              {frame.caption}
            </p>
            <button
              className="btn sm ghost"
              onClick={() => {
                setOpen(false);
                onHide();
              }}
            >
              Hide pet
            </button>
          </div>
        </div>
      )}
    </>
  );
}
