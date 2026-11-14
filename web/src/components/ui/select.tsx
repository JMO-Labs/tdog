import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select">
      <select className={cn("input", className)} {...props}>
        {children}
      </select>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M4 7l6 6 6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
