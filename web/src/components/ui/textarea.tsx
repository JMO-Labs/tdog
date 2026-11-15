import { forwardRef, type ComponentProps } from "react";
import { cn } from "../../lib/utils";

/** Multi-line sibling of Input (same control styling). */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<"textarea">
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("input", className)} {...props} />;
});
