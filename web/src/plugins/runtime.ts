/** The app's single plugin manager, started once after sign-in. */
import { PluginManager, type GateResult } from "./PluginManager";
import { createBrokerHost } from "./pluginHost";

let manager: PluginManager | null = null;

/** Start enabled plugins; returns a stop function. */
export function startPlugins(
  onStopped: (plugin: string, reason: string) => void,
  make: (host: ReturnType<typeof createBrokerHost>) => PluginManager = (h) =>
    new PluginManager(h),
): () => void {
  manager?.destroy();
  const m = make(createBrokerHost(onStopped));
  manager = m;
  void m.sync();
  return () => {
    m.destroy();
    if (manager === m) manager = null;
  };
}

/** Re-read installed plugins after install/enable/disable/uninstall. */
export function syncPlugins(): Promise<void> {
  return manager?.sync() ?? Promise.resolve();
}

export const plugins = {
  hasGate: (): boolean => manager?.hasGate() ?? false,
  gate: (text: string): Promise<GateResult> =>
    manager?.gate(text) ?? Promise.resolve({ verdict: "allow", reason: "" }),
  observe: (line: string): void => manager?.observe(line),
};
