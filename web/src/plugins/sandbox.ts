/**
 * Plugin sandbox (ADR-0005): a hidden `sandbox="allow-scripts"` iframe (opaque
 * origin, strict CSP) whose only job is to start a Worker. Plugin code runs in
 * that Worker: no DOM, no navigation, no network (CSP connect-src falls back to
 * 'none'). The iframe HTML and the worker prelude are constants; plugin source
 * arrives as message data and is loaded with importScripts(blob:) only after
 * the prelude has hidden the host port in a closure.
 */
import { PluginBroker, type BrokerHost, type Port } from "./broker";

/** Runs first in the Worker. Exposes a frozen `tdog`; never the port. */
export const PRELUDE = `"use strict";
(() => {
  const post = MessagePort.prototype.postMessage;
  const on = { gate: null, line: null, action: null };
  const waiting = new Map();
  let seq = 0;
  function init(e) {
    if (!e.data || e.data.type !== "init" || !e.ports || !e.ports[0]) return;
    e.stopImmediatePropagation();
    self.removeEventListener("message", init);
    const port = e.ports[0];
    const send = (m) => post.call(port, m);
    port.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.type === "gate") {
        Promise.resolve()
          .then(() => (on.gate ? on.gate(String(m.line)) : null))
          .then((v) => {
            const confirm = v && v.verdict === "confirm";
            send({ type: "verdict", id: m.id, verdict: confirm ? "confirm" : "allow",
              reason: confirm && typeof v.reason === "string" ? v.reason.slice(0, 200) : "" });
          })
          .catch(() => send({ type: "verdict", id: m.id, verdict: "allow", reason: "" }));
      } else if (m.type === "line" && on.line) {
        try { on.line(String(m.line)); } catch (_) {}
      } else if (m.type === "screen" && waiting.has(m.id)) {
        waiting.get(m.id)(m.lines);
        waiting.delete(m.id);
      } else if (m.type === "action" && on.action) {
        try { on.action(m.id, m.value); } catch (_) {}
      }
    };
    const tdog = Object.freeze({
      onGate: (fn) => { on.gate = fn; },
      onLine: (fn) => { on.line = fn; },
      onAction: (fn) => { on.action = fn; },
      screen: () => new Promise((resolve) => { const id = ++seq; waiting.set(id, resolve); send({ type: "screen", id }); }),
      overlay: (nodes) => send({ type: "overlay", nodes }),
      dismiss: () => send({ type: "dismiss" }),
      insert: (text) => send({ type: "insert", text: String(text) }),
    });
    Object.defineProperty(self, "tdog", { value: tdog, enumerable: true });
    try { importScripts(e.data.plugin); }
    catch (err) { send({ type: "error", error: String(err).slice(0, 400) }); }
    // Ready only once the plugin has registered its handlers.
    send({ type: "ready" });
  }
  self.addEventListener("message", init);
})();
`;

const CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:";

/** Constant iframe document: relays one init message into a new Worker. */
export const SRCDOC = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}"><script>
window.addEventListener("message", function boot(e) {
  if (!e.data || e.data.type !== "init" || !e.ports || !e.ports[0]) return;
  window.removeEventListener("message", boot);
  var js = function (s) { return URL.createObjectURL(new Blob([s], { type: "text/javascript" })); };
  var w = new Worker(js(e.data.prelude));
  w.postMessage({ type: "init", plugin: js(String(e.data.code)) }, [e.ports[0]]);
});
</script>`;

export interface Sandbox {
  broker: PluginBroker;
  dispose(): void;
}

/** Start one plugin. */
export function createSandbox(
  plugin: { id: string; name: string; permissions: string[] },
  code: string,
  host: BrokerHost,
): Sandbox {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.display = "none";
  frame.srcdoc = SRCDOC;
  const ch = new MessageChannel();
  const broker = new PluginBroker(
    plugin.id,
    plugin.name,
    plugin.permissions,
    ch.port1 as unknown as Port,
    host,
  );
  frame.addEventListener(
    "load",
    () =>
      frame.contentWindow?.postMessage(
        { type: "init", prelude: PRELUDE, code },
        "*", // opaque-origin frame: no origin to name; it only gets a port
        [ch.port2],
      ),
    { once: true },
  );
  document.body.appendChild(frame);
  ch.port1.start();
  return {
    broker,
    dispose: () => {
      broker.stop();
      frame.remove();
    },
  };
}
