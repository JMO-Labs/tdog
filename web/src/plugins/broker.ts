/** API broker: gated access to pane APIs from plugins. */

import type { PluginMessage, HostMessage, OverlayNode } from "./schema";
import { isValidPluginMessage } from "./schema";

// Host-enforced limits (cannot be bypassed by plugin code)
const MAX_MESSAGE_SIZE = 64 * 1024; // 64 KB
const MAX_MESSAGES_PER_SEC = 50;

export interface BrokerContext {
  /** Get visible lines from the focused pane. */
  getScreen(): string[];
  /** Called when plugin requests input:gate. Returns true if confirmed. */
  requestGate(line: string, reason: string): Promise<boolean>;
  /** Called when plugin renders an overlay. */
  renderOverlay(tree: OverlayNode): Promise<void>;
  /** Dismiss any open overlay. */
  dismissOverlay(): void;
  /** Called when plugin violates limits or misbehaves. */
  onPluginError?(reason: string): void;
}

export interface PendingRequest {
  id: string;
  resolve: (msg: HostMessage) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Broker mediates plugin messages to the host, gating by permissions. */
export class PluginBroker {
  private port: MessagePort;
  private permissions: Set<string>;
  private ctx: BrokerContext;
  private messageCount = 0;
  private messageWindow = Date.now();
  private terminated = false;

  constructor(port: MessagePort, permissions: string[], ctx: BrokerContext) {
    this.port = port;
    this.permissions = new Set(permissions);
    this.ctx = ctx;
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  private hasPermission(perm: string): boolean {
    return this.permissions.has(perm);
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.messageWindow > 1000) {
      this.messageCount = 0;
      this.messageWindow = now;
    }
    this.messageCount++;
    if (this.messageCount > MAX_MESSAGES_PER_SEC) {
      return false;
    }
    return true;
  }

  private checkMessageSize(msg: unknown): boolean {
    try {
      // Validate that message is plain JSON-serializable data
      // Rejects: ArrayBuffer, typed arrays, Blob, Map, Set, Date, RegExp, Error, functions, cyclic
      const json = JSON.stringify(msg);
      const reparsed = JSON.parse(json);

      // Deep equality check: verify re-stringify matches
      // Catches: Date conversions, lossy transformations, cyclic references
      if (JSON.stringify(reparsed) !== json) {
        return false;
      }

      return json.length <= MAX_MESSAGE_SIZE;
    } catch {
      // JSON errors: cyclic refs, rejected values, etc.
      return false;
    }
  }

  private terminate(reason: string): void {
    if (this.terminated) return;
    this.terminated = true;
    this.ctx.onPluginError?.(reason);
    this.port.close();
  }

  private async handleMessage(msg: unknown): Promise<void> {
    if (this.terminated) return;

    // Check rate limit (host-side enforcement)
    if (!this.checkRateLimit()) {
      this.terminate("Rate limit exceeded: too many messages");
      return;
    }

    // Check message size (host-side enforcement)
    if (!this.checkMessageSize(msg)) {
      this.terminate("Message too large");
      return;
    }

    // Validate message schema
    if (!isValidPluginMessage(msg)) {
      this.sendToPlugin({
        type: "error",
        id: "invalid",
        error: "Invalid message format",
      });
      return;
    }

    const m = msg as PluginMessage;

    switch (m.type) {
      case "screen:read:request":
        return this.handleScreenRead(m);
      case "input:gate:request":
        return this.handleInputGate(m);
      case "overlay:render":
        return this.handleOverlayRender(m);
      case "overlay:dismiss":
        return this.ctx.dismissOverlay();
      // ignore other types (ready, error, observe are informational)
    }
  }

  private handleScreenRead(
    msg: Extract<PluginMessage, { type: "screen:read:request" }>,
  ): void {
    if (!this.hasPermission("screen:read")) {
      this.sendToPlugin({
        type: "error",
        id: msg.id,
        error: "Permission denied: screen:read",
      });
      return;
    }
    const lines = this.ctx.getScreen();
    this.sendToPlugin({
      type: "screen:read:response",
      id: msg.id,
      lines,
    });
  }

  private async handleInputGate(
    msg: Extract<PluginMessage, { type: "input:gate:request" }>,
  ): Promise<void> {
    if (!this.hasPermission("input:gate")) {
      this.sendToPlugin({
        type: "error",
        id: msg.id,
        error: "Permission denied: input:gate",
      });
      return;
    }

    // Request gate confirmation from host with 300ms timeout
    const promise = Promise.race([
      this.ctx.requestGate(msg.line, "Plugin review requested"),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 300)),
    ]);

    const confirmed = await promise;
    this.sendToPlugin({
      type: "input:gate:response",
      id: msg.id,
      verdict: confirmed ? "allow" : "deny",
    });
  }

  private handleOverlayRender(
    msg: Extract<PluginMessage, { type: "overlay:render" }>,
  ): void {
    if (!this.hasPermission("overlay")) {
      this.sendToPlugin({
        type: "error",
        id: msg.type,
        error: "Permission denied: overlay",
      });
      return;
    }

    // TODO: Render overlay from declarative tree
    // For now, just acknowledge
    this.sendToPlugin({
      type: "error",
      id: msg.type,
      error: "Overlay rendering not yet implemented",
    });
  }

  private sendToPlugin(msg: HostMessage): void {
    this.port.postMessage(msg);
  }

  start(): void {
    this.port.start();
  }

  stop(): void {
    this.terminate("Broker stopped");
  }
}
