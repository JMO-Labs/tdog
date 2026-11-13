export type RendererKind = "xterm" | "restty";

/** `?renderer=xterm|restty`; default and any unknown value is xterm (ADR-0001). */
export function pickRenderer(search: string): RendererKind {
  return new URLSearchParams(search).get("renderer") === "restty"
    ? "restty"
    : "xterm";
}
