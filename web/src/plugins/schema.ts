/** Message types for plugin-to-host communication. All messages must match a known type. */

/** Overlay node types (declarative UI). */
export type OverlayNode =
  OverlayText | OverlayHeading | OverlayList | OverlayButton | OverlayInput;

export interface OverlayText {
  kind: "text";
  text: string;
}

export interface OverlayHeading {
  kind: "heading";
  text: string;
}

export interface OverlayList {
  kind: "list";
  items: { text: string; id: string }[];
}

export interface OverlayButton {
  kind: "button";
  text: string;
  id: string;
  variant?: "default" | "danger";
}

export interface OverlayInput {
  kind: "input";
  id: string;
  placeholder?: string;
}

/** Messages from plugin to host (discriminated union). */
export type PluginMessage =
  | { type: "ready"; permissions: string[] }
  | { type: "screen:read:request"; id: string }
  | { type: "input:observe:line"; line: string }
  | { type: "input:gate:request"; id: string; line: string }
  | { type: "overlay:render"; tree: OverlayNode }
  | { type: "overlay:dismiss" }
  | { type: "error"; error: string };

/** Messages from host to plugin (discriminated union). */
export type HostMessage =
  | { type: "screen:read:response"; id: string; lines: string[] }
  | { type: "input:gate:response"; id: string; verdict: "allow" | "deny" }
  | {
      type: "overlay:action";
      id: string;
      action: "button" | "input";
      elementId: string;
      value?: string;
    }
  | { type: "error"; id: string; error: string };

/** Type guard: check if message matches schema. */
export function isValidPluginMessage(msg: unknown): msg is PluginMessage {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as PluginMessage;
  const validTypes: (PluginMessage["type"] | HostMessage["type"])[] = [
    "ready",
    "screen:read:request",
    "input:observe:line",
    "input:gate:request",
    "overlay:render",
    "overlay:dismiss",
    "error",
  ];
  return validTypes.includes(m.type);
}

export function isValidHostMessage(msg: unknown): msg is HostMessage {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as HostMessage;
  const validTypes: HostMessage["type"][] = [
    "screen:read:response",
    "input:gate:response",
    "overlay:action",
    "error",
  ];
  return validTypes.includes(m.type);
}
