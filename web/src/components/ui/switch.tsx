import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "role"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({
  checked,
  onCheckedChange,
  className,
  onClick,
  ...props
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn("switch", className)}
      onClick={(e) => {
        onClick?.(e);
        onCheckedChange(!checked);
      }}
      {...props}
    />
  );
}
