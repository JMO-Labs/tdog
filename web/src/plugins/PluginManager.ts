/** Plugin lifecycle manager: init/start/stop plugins based on enabled state. */

import { createSandbox } from "./sandbox";
import { getPluginEntry, listPlugins, type PluginInfo } from "./api";
import { PluginBroker, type BrokerContext } from "./broker";

export interface PluginInstance {
  id: string;
  info: PluginInfo;
  broker?: PluginBroker;
  cleanup?: () => void;
}

/** Manages plugin startup/shutdown and communicates with pane context. */
export class PluginManager {
  private plugins = new Map<string, PluginInstance>();
  private ctx: BrokerContext;
  private sandboxFactory = createSandbox; // Can be mocked in tests

  constructor(ctx: BrokerContext) {
    this.ctx = ctx;
  }

  /** Load installed plugins from backend and start enabled ones. */
  async init(): Promise<void> {
    try {
      const list = await listPlugins();
      for (const info of list) {
        this.plugins.set(info.id, { id: info.id, info });
        if (info.enabled) {
          await this.startPlugin(info.id);
        }
      }
    } catch (err) {
      console.error("Failed to initialize plugins:", err);
    }
  }

  /** Start a plugin: fetch entry code and create sandbox. */
  async startPlugin(id: string): Promise<void> {
    const inst = this.plugins.get(id);
    if (!inst) return;
    if (inst.broker) return; // Already running

    try {
      const entry = await getPluginEntry(id);
      const { cleanup, broker } = await this.sandboxFactory(
        entry,
        inst.info.permissions,
        this.ctx,
      );
      inst.broker = broker;
      inst.cleanup = cleanup;
    } catch (err) {
      console.error(`Failed to start plugin ${id}:`, err);
    }
  }

  /** Stop a plugin: cleanup sandbox. */
  async stopPlugin(id: string): Promise<void> {
    const inst = this.plugins.get(id);
    if (!inst || !inst.broker) return;

    inst.cleanup?.();
    inst.broker = undefined;
    inst.cleanup = undefined;
  }

  /** Enable a plugin: start it if not already running. */
  async enablePlugin(id: string): Promise<void> {
    const inst = this.plugins.get(id);
    if (!inst) return;
    inst.info.enabled = true;
    await this.startPlugin(id);
  }

  /** Disable a plugin: stop it. */
  async disablePlugin(id: string): Promise<void> {
    const inst = this.plugins.get(id);
    if (!inst) return;
    inst.info.enabled = false;
    await this.stopPlugin(id);
  }

  /** Install a new plugin: add to list and start if enabled. */
  async installPlugin(id: string, info: PluginInfo): Promise<void> {
    this.plugins.set(id, { id, info });
    if (info.enabled) {
      await this.startPlugin(id);
    }
  }

  /** Uninstall a plugin: stop and remove. */
  async uninstallPlugin(id: string): Promise<void> {
    await this.stopPlugin(id);
    this.plugins.delete(id);
  }

  /** Cleanup: stop all plugins. */
  async destroy(): Promise<void> {
    for (const inst of this.plugins.values()) {
      await this.stopPlugin(inst.id);
    }
    this.plugins.clear();
  }

  /** Get all active brokers (for wiring input events). */
  getActiveBrokers(): PluginBroker[] {
    return Array.from(this.plugins.values())
      .filter((inst) => inst.broker)
      .map((inst) => inst.broker!);
  }

  /** For testing: inject a mock sandbox factory. */
  setSandboxFactory(
    factory: (
      code: string,
      perms: string[],
      ctx: BrokerContext,
    ) => Promise<{ cleanup: () => void; broker: PluginBroker }>,
  ): void {
    this.sandboxFactory = factory;
  }
}
