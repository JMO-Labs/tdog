import type { KeyboardEvent } from "react";

/** Arrow-key focus movement among `sel` matches inside the event's container. */
export function roving(
  e: KeyboardEvent<HTMLElement>,
  sel: string,
  keys: Record<string, number | "home" | "end">,
  wrap: boolean,
): void {
  const move = keys[e.key];
  if (move === undefined) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(sel)];
  if (!items.length) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  let to: number;
  if (move === "home") to = 0;
  else if (move === "end") to = items.length - 1;
  else if (wrap) to = (at + move + items.length) % items.length;
  else to = Math.min(items.length - 1, Math.max(0, at + move));
  items[to].focus();
}
