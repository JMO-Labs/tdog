import { useRef, type KeyboardEvent } from "react";
import { cn } from "../../lib/utils";

type Option = { value: string; label: string };
type Props = {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  className?: string;
};

/** radiogroup with roving tabindex; arrows select and wrap. */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  className,
  "aria-label": label,
}: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const n = (i + step + options.length) % options.length;
    onValueChange(options[n].value);
    refs.current[n]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn("seg", className)}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onValueChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
