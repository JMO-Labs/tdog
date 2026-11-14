import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

const LEN = 6;

/** Six single-digit boxes: auto-advance, backspace-back, paste fills all. */
export function OtpBoxes(props: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) =>
    refs.current[Math.min(Math.max(i, 0), LEN - 1)]?.focus();
  useEffect(() => {
    if (props.autoFocus) focus(0);
  }, [props.autoFocus]);

  const set = (i: number, d: string) => {
    const chars = props.value.padEnd(LEN, " ").split("");
    chars[i] = d || " ";
    props.onChange(chars.join("").trimEnd());
  };
  const onPaste = (e: ClipboardEvent) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    e.preventDefault();
    const v = digits.slice(0, LEN);
    props.onChange(v);
    focus(v.length);
  };
  const onKey = (i: number, e: KeyboardEvent) => {
    if (e.key === "Backspace" && !props.value[i]?.trim()) focus(i - 1);
  };

  return (
    <div className="otp" role="group" aria-label="6-digit code">
      {Array.from({ length: LEN }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="input otp-box"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          value={props.value[i]?.trim() ?? ""}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(-1);
            set(i, d);
            if (d) focus(i + 1);
          }}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
