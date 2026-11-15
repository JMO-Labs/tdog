/** Input line tracking and gate flow for plugin permission checks. */

import type { PluginBroker } from "./broker";

export interface LineTracker {
  getLine(): string;
  isUncertain(): boolean;
  append(text: string): void;
  backspace(): void;
  clearLine(): void;
  interrupt(): void;
  markUncertain(): void;
}

export function lineTracker(): LineTracker {
  let line = "";
  let uncertain = false;

  return {
    getLine() {
      return line;
    },

    isUncertain() {
      return uncertain;
    },

    append(text: string) {
      line += text;
      uncertain = false; // Clear uncertainty on new input
    },

    backspace() {
      if (line.length > 0) {
        line = line.slice(0, -1);
      }
    },

    clearLine() {
      // Ctrl-U
      line = "";
      uncertain = false;
    },

    interrupt() {
      // Ctrl-C: keep line but mark uncertain
      uncertain = true;
    },

    markUncertain() {
      // Cursor key or other navigation
      uncertain = true;
    },
  };
}

/**
 * Gate flow: ask gate plugins for verdict with 300ms timeout.
 * Returns "allow" if no gate plugins, all approve, or timeout.
 * Returns "deny" if any plugin denies within timeout.
 */
export async function gateFlow(
  line: string,
  brokers: PluginBroker[],
  timeoutMs: number,
): Promise<"allow" | "deny"> {
  const gatePlugins = brokers.filter((b) =>
    (b as any).permissions?.has("input:gate"),
  );

  if (gatePlugins.length === 0) {
    return "allow";
  }

  // Collect verdicts from all gate plugins
  const verdicts = await Promise.race([
    (async () => {
      const results: boolean[] = [];
      for (const broker of gatePlugins) {
        const result = await (broker as any).requestGate?.(
          line,
          "Plugin review requested",
        );
        if (result === false) {
          return false; // Short-circuit on first deny
        }
        results.push(result ?? true);
      }
      return results.every((r) => r);
    })(),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(true), timeoutMs),
    ),
  ]);

  return verdicts ? "allow" : "deny";
}
