/**
 * Host side of one plugin (ADR-0005). Enforces permissions, message shape,
 * size and rate here, outside the plugin's reach; the plugin only ever sees
 * what this class posts to its port.
 */
import {
  parsePluginMessage,
  type HostToPlugin,
  type OverlayNode,
} from "./schema";

export const MAX_MESSAGES_PER_SEC = 50;
export const GATE_TIMEOUT_MS = 300;
/** A plugin still starting gets longer, so a fast Enter can't slip past it. */
export const GATE_STARTUP_TIMEOUT_MS = 2000;
/** How long after a click in its overlay a plugin may insert text. */
const INSERT_WINDOW_MS = 2000;

export type Verdict = { verdict: "allow" | "confirm"; reason: string };

/** What a plugin can reach, always through tdog. */
export interface BrokerHost {
  /** Visible lines of the focused pane. */
  screen(): string[];
  /** Show (or replace) this plugin's overlay in the focused pane. */
  showOverlay(
    plugin: string,
    nodes: OverlayNode[],
    onAction: (id: string, value?: string) => void,
  ): void;
  hideOverlay(plugin: string): void;
  /** Insert text at the cursor of the pane showing this plugin's overlay. */
  insert(plugin: string, text: string): void;
  /** The plugin broke a rule and was stopped. */
  onStopped(plugin: string, reason: string): void;
}

export interface Port {
  postMessage(m: HostToPlugin): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}

export class PluginBroker {
  private perms: Set<string>;
  private seq = 0;
  private gates = new Map<number, (v: Verdict) => void>();
  private window = { start: 0, count: 0 };
  private lastAction = -Infinity;
  private ready = false;
  stopped = false;

  constructor(
    readonly id: string,
    readonly name: string,
    permissions: string[],
    private port: Port,
    private host: BrokerHost,
    private now: () => number = () => Date.now(),
  ) {
    this.perms = new Set(permissions);
    port.onmessage = (e) => this.receive(e.data);
  }

  has(p: string): boolean {
    return this.perms.has(p);
  }

  /** Ask the plugin about a line before it runs; silence = allow. */
  gate(line: string): Promise<Verdict> {
    const allow: Verdict = { verdict: "allow", reason: "" };
    if (this.stopped || !this.has("input:gate")) return Promise.resolve(allow);
    const id = ++this.seq;
    return new Promise((resolve) => {
      const done = (v: Verdict) => {
        clearTimeout(t);
        this.gates.delete(id);
        resolve(v);
      };
      const t = setTimeout(
        () => done(allow),
        this.ready ? GATE_TIMEOUT_MS : GATE_STARTUP_TIMEOUT_MS,
      );
      this.gates.set(id, done);
      this.port.postMessage({ type: "gate", id, line });
    });
  }

  /** Tell an observing plugin a line was run. */
  observe(line: string): void {
    if (!this.stopped && this.has("input:observe"))
      this.port.postMessage({ type: "line", line });
  }

  stop(reason?: string): void {
    if (this.stopped) return;
    this.stopped = true;
    this.gates.forEach((done) => done({ verdict: "allow", reason: "" }));
    this.host.hideOverlay(this.id);
    this.port.onmessage = null;
    this.port.close();
    if (reason) this.host.onStopped(this.id, reason);
  }

  private receive(raw: unknown): void {
    if (this.stopped) return;
    const t = this.now();
    if (t - this.window.start >= 1000) this.window = { start: t, count: 0 };
    if (++this.window.count > MAX_MESSAGES_PER_SEC)
      return this.stop("sent too many messages");
    const m = parsePluginMessage(raw);
    if (!m) return this.stop("sent a malformed or oversized message");
    switch (m.type) {
      case "verdict":
        this.gates.get(m.id)?.({ verdict: m.verdict, reason: m.reason });
        return;
      case "screen":
        if (this.has("screen:read"))
          this.port.postMessage({
            type: "screen",
            id: m.id,
            lines: this.host.screen(),
          });
        return;
      case "overlay":
        if (this.has("overlay"))
          this.host.showOverlay(this.id, m.nodes, (id, value) => {
            this.lastAction = this.now();
            this.port.postMessage({ type: "action", id, value });
          });
        return;
      case "dismiss":
        this.host.hideOverlay(this.id);
        return;
      case "insert":
        // Only right after the user clicked in this plugin's overlay.
        if (
          this.has("input:insert") &&
          this.now() - this.lastAction <= INSERT_WINDOW_MS
        ) {
          this.lastAction = -Infinity;
          this.host.insert(this.id, m.text);
        }
        return;
      case "ready":
        this.ready = true;
        return;
      case "error":
        return;
    }
  }
}
