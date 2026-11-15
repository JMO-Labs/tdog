/**
 * Host side shared by all plugins: screen of the focused pane, and plugin
 * overlays drawn by tdog (control kit, plain text only) inside that pane.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "../components/ui/button";
import "./plugins.css";
import { Input } from "../components/ui/input";
import {
  openFocusedPaneOverlay,
  readFocusedScreen,
} from "../overlays/pane/focusedPane";
import { registerPaneOverlay } from "../overlays/pane/registry";
import type { PaneOverlayContext } from "../terminal/renderer";
import type { BrokerHost } from "./broker";
import type { OverlayNode } from "./schema";

type Shown = {
  nodes: OverlayNode[];
  onAction: (id: string, value?: string) => void;
};
const shown = new Map<string, Shown>();
const subs = new Set<() => void>();
const inserters = new Map<string, (text: string) => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

export function createBrokerHost(
  onStopped: (plugin: string, reason: string) => void,
): BrokerHost {
  return {
    screen: readFocusedScreen,
    showOverlay(plugin, nodes, onAction) {
      shown.set(plugin, { nodes, onAction });
      emit();
      const id = `plugin:${plugin}`;
      registerPaneOverlay({
        id,
        title: plugin,
        render: (ctx) => <PluginOverlayView plugin={plugin} ctx={ctx} />,
      });
      openFocusedPaneOverlay(id);
    },
    hideOverlay(plugin) {
      if (shown.delete(plugin)) emit();
    },
    insert(plugin, text) {
      inserters.get(plugin)?.(text);
    },
    onStopped,
  };
}

export function PluginOverlayView(props: {
  plugin: string;
  ctx: PaneOverlayContext;
}) {
  const { plugin, ctx } = props;
  const s = useSyncExternalStore(subscribe, () => shown.get(plugin));
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    inserters.set(plugin, ctx.insert);
    return () => void inserters.delete(plugin);
  }, [plugin, ctx]);
  useEffect(() => {
    if (!s) ctx.close();
  }, [s, ctx]);
  if (!s) return null;
  return (
    <div className="plugin-overlay" aria-label={`Plugin ${plugin}`}>
      <p className="plugin-overlay-from">From plugin {plugin}</p>
      {s.nodes.map((n, i) => {
        switch (n.kind) {
          case "heading":
            return <h3 key={i}>{n.text}</h3>;
          case "text":
            return <p key={i}>{n.text}</p>;
          case "list":
            return (
              <ul key={i}>
                {n.items.map((t, j) => (
                  <li key={j}>{t}</li>
                ))}
              </ul>
            );
          case "button":
            return (
              <Button
                key={i}
                variant={n.danger ? "danger" : "default"}
                size="sm"
                onClick={() => s.onAction(n.id)}
              >
                {n.text}
              </Button>
            );
          case "input":
            return (
              <label key={i} className="plugin-overlay-field">
                <span>{n.label}</span>
                <Input
                  value={values[n.id] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [n.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") s.onAction(n.id, values[n.id] ?? "");
                  }}
                />
              </label>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
