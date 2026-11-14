import type { ButtonHTMLAttributes } from "react";
import { Tooltip } from "../../overlays/Tooltip";
import { cn } from "../../lib/utils";

type Variant = "default" | "primary" | "danger" | "ghost";
type Size = "md" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "btn",
        variant !== "default" && variant,
        size === "sm" && "sm",
        className,
      )}
      {...props}
    />
  );
}

type IconButtonProps = Omit<ButtonProps, "variant" | "aria-label"> & {
  label: string;
  /** Tooltip text when it differs from the accessible label. */
  tip?: string;
  shortcut?: string;
  variant?: "default" | "danger";
};

export function IconButton({
  label,
  tip,
  shortcut,
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip label={tip ?? label} shortcut={shortcut}>
      <button
        type={type}
        aria-label={label}
        className={cn(
          "icon-btn",
          variant === "danger" && "danger",
          size === "sm" && "sm",
          className,
        )}
        {...props}
      />
    </Tooltip>
  );
}
