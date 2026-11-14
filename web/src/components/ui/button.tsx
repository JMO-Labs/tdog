import type { ButtonHTMLAttributes } from "react";
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
  variant?: "default" | "danger";
};

export function IconButton({
  label,
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "icon-btn",
        variant === "danger" && "danger",
        size === "sm" && "sm",
        className,
      )}
      {...props}
    />
  );
}
