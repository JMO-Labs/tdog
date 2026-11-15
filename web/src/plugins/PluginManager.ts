/** Starts/stops one sandbox per enabled plugin and fans out gate/observe. */
import { getPluginEntry, listPlugins, type PluginInfo } from "./api";
import type { BrokerHost, Verdict } from "./broker";
import { createSandbox, type Sandbox } from "./sandbox";

export type GateResult = Verdict & { plugin?: string };

export type SandboxFactory = (
  plugin: { id: string; name: string; permissions: string[] },
  code: string,
  host: BrokerHost,
) => Sandbox;

/** Longest an Enter waits for plugins that are still loading. */
export const LOAD_WAIT_MS = 3000;

export class PluginManager {
  private running = new Map<string, Sandbox>();
  /** Set while plugins load: Enter waits instead of slipping past a guard. */
  private loading: Promise<void> | null = null;

  constructor(
    private host: BrokerHost,
    private make: SandboxFactory = createSandbox,
    private list: () => Promise<PluginInfo[]> = listPlugins,
    private entry: (id: string) => Promise<string> = getPluginEntry,
  ) {}

  /** Start every enabled plugin and stop the rest (call after any change). */
  async sync(): Promise<void> {
    // One sync at a time: overlapping ones could start a plugin twice and
    // leave a copy running after it was disabled.
    const run = (this.loading ?? Promise.resolve()).then(() => this.load());
    this.loading = run;
    try {
      await run;
    } finally {
      if (this.loading === run) this.loading = null;
    }
  }

  private async load(): Promise<void> {
    let infos: PluginInfo[];
    try {
      infos = await this.list();
    } catch {
      return; // offline or signed out: keep what runs
    }
    const want = new Map(infos.filter((p) => p.enabled).map((p) => [p.id, p]));
    for (const id of [...this.running.keys()]) if (!want.has(id)) this.stop(id);
    for (const p of want.values()) {
      if (this.running.has(p.id)) continue;
      try {
        const code = await this.entry(p.id);
        this.running.set(
          p.id,
          this.make(
            { id: p.id, name: p.name || p.id, permissions: p.permissions },
            code,
            this.host,
          ),
        );
      } catch {
        /* entry unavailable: try again on the next sync */
      }
    }
  }

  stop(id: string): void {
    this.running.get(id)?.dispose();
    this.running.delete(id);
  }

  destroy(): void {
    for (const id of [...this.running.keys()]) this.stop(id);
  }

  /** True when some running plugin may hold a command for confirmation. */
  hasGate(): boolean {
    if (this.loading) return true;
    return [...this.running.values()].some(
      (s) => !s.broker.stopped && s.broker.has("input:gate"),
    );
  }

  /** Ask every gate plugin at once; the first "confirm" wins. */
  async gate(line: string): Promise<GateResult> {
    if (this.loading)
      await Promise.race([
        this.loading,
        new Promise((r) => setTimeout(r, LOAD_WAIT_MS)),
      ]);
    const brokers = [...this.running.values()].map((s) => s.broker);
    const verdicts = await Promise.all(brokers.map((b) => b.gate(line)));
    const i = verdicts.findIndex((v) => v.verdict === "confirm");
    return i < 0
      ? { verdict: "allow", reason: "" }
      : { ...verdicts[i], plugin: brokers[i].name };
  }

  observe(line: string): void {
    for (const s of this.running.values()) s.broker.observe(line);
  }
}
