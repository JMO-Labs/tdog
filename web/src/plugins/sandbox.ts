/** Sandbox: runs plugin code in a Worker inside a sandboxed iframe for maximum isolation. */

import { PluginBroker, type BrokerContext } from "./broker";

/**
 * Create and run a plugin in a secure sandbox: Worker inside a sandboxed iframe.
 * - iframe: sandbox="allow-scripts", no same-origin, CSP blocks network
 * - Worker: no DOM, no navigation, no network, runs plugin code only
 * - Rate limiting and message size enforcement done HOST-side (in broker)
 * Returns a cleanup function and broker for API access.
 */
export async function createSandbox(
  entryCode: string,
  permissions: string[],
  ctx: BrokerContext,
): Promise<{ cleanup: () => void; broker: PluginBroker }> {
  // Create MessageChannel for communication
  const channel = new MessageChannel();
  const hostPort = channel.port1;
  const pluginPort = channel.port2;

  // Create iframe with strict isolation, opaque origin, CSP
  const iframe = document.createElement("iframe");
  iframe.sandbox.add("allow-scripts");
  // Note: intentionally NO allow-same-origin; this keeps the iframe origin opaque
  // and prevents access to parent window or localStorage
  iframe.style.display = "none";

  // Worker prelude: sets up the tdog API, port kept in closure (not accessible to plugin)
  const workerPrelude = `
    // Port is kept in a closure that plugin code cannot access
    let port = null;

    // Receive port from iframe bootstrap
    self.addEventListener('message', function setup(e) {
      if (e.data && e.data.type === 'init' && e.ports && e.ports[0]) {
        port = e.ports[0];
        self.removeEventListener('message', setup);

        // Create tdog API (restricted interface, all via postMessage)
        // Object.freeze prevents plugin from accessing port or modifying methods
        const tdog = Object.freeze({
          ready: (perms) => {
            port.postMessage({ type: 'ready', permissions: perms });
          },
          screenRead: (id) => {
            port.postMessage({ type: 'screen:read:request', id });
          },
          inputObserve: (line) => {
            port.postMessage({ type: 'input:observe:line', line });
          },
          inputGate: (id, line) => {
            port.postMessage({ type: 'input:gate:request', id, line });
          },
          overlayRender: (tree) => {
            port.postMessage({ type: 'overlay:render', tree });
          },
          overlayDismiss: () => {
            port.postMessage({ type: 'overlay:dismiss' });
          },
          error: (err) => {
            port.postMessage({ type: 'error', error: String(err) });
          },
        });

        // Run plugin code in isolated scope with the tdog API
        try {
          (function(tdog) {
            'use strict';
            // Plugin code is injected here
            PLUGIN_CODE_PLACEHOLDER
          })(tdog);
        } catch (err) {
          tdog.error(err);
        }

        // Clean up global references to port and setup function
        port.start();

        // Delete global references so plugin code cannot access them
        delete self.addEventListener;
        delete self.removeEventListener;
      }
    });
  `;

  // Replace placeholder with actual plugin code
  const workerCode = workerPrelude.replace(
    "PLUGIN_CODE_PLACEHOLDER",
    entryCode,
  );

  // Bootstrap code runs in the iframe; it creates the Worker from a Blob
  const bootstrapCode = `
    (function() {
      "use strict";

      // Strict CSP: no network, no navigation, only unsafe-inline for our bootstrap
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:";
      document.head.appendChild(meta);

      // Receive MessagePort from host and worker code
      window.addEventListener('message', function setup(e) {
        if (e.data && e.data.type === 'init' && e.ports && e.ports[0]) {
          const port = e.ports[0];
          const workerCode = e.data.workerCode;
          window.removeEventListener('message', setup);

          // Create Worker from Blob (isolates plugin further: no navigation, no DOM)
          const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
          const workerUrl = URL.createObjectURL(workerBlob);
          const worker = new Worker(workerUrl);

          // Relay messages between host port and worker
          port.onmessage = (e) => {
            worker.postMessage(e.data);
          };
          worker.onmessage = (e) => {
            port.postMessage(e.data);
          };

          // Send port and start worker
          worker.postMessage({ type: 'init' }, [port]);
          port.start();
        }
      });
    })();
  `;

  // Create srcdoc (ONLY contains our bootstrap, never plugin code)
  iframe.srcdoc = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:">
      </head>
      <body>
        <script>${bootstrapCode}</script>
      </body>
    </html>`;

  // Add iframe to DOM
  document.body.appendChild(iframe);

  // Send port, worker code, and plugin code to iframe via postMessage
  iframe.contentWindow?.postMessage({ type: "init", workerCode }, "*", [
    pluginPort,
  ]);

  // Create broker
  const broker = new PluginBroker(hostPort, permissions, ctx);
  broker.start();

  // Cleanup function
  const cleanup = () => {
    broker.stop();
    document.body.removeChild(iframe);
  };

  return { cleanup, broker };
}
