import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min" | "max"
> & {
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
};

/** Native range input: keyboard + aria for free, sticker thumb via CSS. */
export function Slider({ value, onValueChange, className, ...props }: Props) {
  return (
    <input
      type="range"
      className={cn("slider", className)}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      {...props}
    />
  );
}
