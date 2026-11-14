import { useState } from "react";
import { Pop } from "../motion/Pop";
import { Icon } from "../shell/icons";
import { roving } from "./roving";
import { TEMPLATES, type TemplateId } from "./templates";

const AREAS: Record<TemplateId, string[]> = {
  single: ["a"],
  "2-up": ["a b"],
  "3-col": ["a b c"],
  "1+2": ["a b", "a c"],
  "2x2": ["a b", "c d"],
  "1+3": ["a b", "a c", "a d"],
};
const cells = (id: TemplateId) =>
  [...new Set(AREAS[id].join(" ").match(/[a-d]/g))] as string[];

export interface SnapPickerProps {
  /** Returns surplus pane ids when confirmation is needed (nothing applied). */
  onSnap: (t: TemplateId, confirmed?: boolean) => string[];
}

/** Win11-style layout handle: hover/focus opens the template picker. */
export function SnapPicker({ onSnap }: SnapPickerProps) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<{ t: TemplateId; n: number } | null>(null);
  const close = () => {
    setOpen(false);
    setAsk(null);
  };
  const pick = (t: TemplateId) => {
    const surplus = onSnap(t);
    if (surplus.length) setAsk({ t, n: surplus.length });
    else close();
  };
  return (
    <span
      className="snap-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <button
        className="pane-btn icon-btn sm"
        aria-label="Layouts"
        title="Snap layouts"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="layout" />
      </button>
      <div className="snap-pop" hidden={!open}>
        <Pop show={open}>
          <div
            className="snap-panel pop-card"
            role="group"
            aria-label="Snap layouts"
            onKeyDown={(e) =>
              roving(
                e,
                "button.snap",
                { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 },
                false,
              )
            }
          >
            <h3 className="pop-title">
              {ask ? "Apply layout?" : "Pick a layout"}
            </h3>
            {ask ? (
              <div className="snap-ask" role="alertdialog">
                <p>
                  Close {ask.n} pane{ask.n > 1 ? "s" : ""} and kill{" "}
                  {ask.n > 1 ? "their shells" : "its shell"}?
                </p>
                <button
                  className="btn danger"
                  onClick={() => {
                    onSnap(ask.t, true);
                    close();
                  }}
                >
                  Close and apply
                </button>
                <button className="btn" onClick={() => setAsk(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className="snap"
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => pick(t.id)}
                >
                  <span
                    className="mini"
                    style={{
                      gridTemplateAreas: AREAS[t.id]
                        .map((r) => `"${r}"`)
                        .join(" "),
                      gridTemplateColumns:
                        t.id === "3-col" ? "1fr 1fr 1fr" : "1fr 1fr",
                    }}
                  >
                    {cells(t.id).map((c) => (
                      <i key={c} style={{ gridArea: c }} />
                    ))}
                  </span>
                  {t.label}
                </button>
              ))
            )}
          </div>
        </Pop>
      </div>
    </span>
  );
}
