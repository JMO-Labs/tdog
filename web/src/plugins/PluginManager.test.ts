import { expect, test, vi } from "vitest";
import type { PluginInfo } from "./api";
import { PluginBroker, type BrokerHost, type Port } from "./broker";
import { PluginManager, type SandboxFactory } from "./PluginManager";
import { PRELUDE, SRCDOC } from "./sandbox";

const info = (id: string, enabled: boolean, permissions: string[] = []) =>
  ({
    id,
    name: id,
    author: "t",
    version: "1.0.0",
    enabled,
    permissions,
    sha256: "x",
  }) as PluginInfo;
const host = {} as BrokerHost;

function rig(list: PluginInfo[]) {
  const started: string[] = [];
  const disposed: string[] = [];
  const ports = new Map<string, Port>();
  const make: SandboxFactory = (p) => {
    started.push(p.id);
    const port: Port = {
      postMessage: vi.fn(),
      onmessage: null,
      close: vi.fn(),
    };
    ports.set(p.id, port);
    const broker = new PluginBroker(p.id, p.name, p.permissions, port, {
      screen: () => [],
      showOverlay: vi.fn(),
      hideOverlay: vi.fn(),
      insert: vi.fn(),
      onStopped: vi.fn(),
    });
    return { broker, dispose: () => void disposed.push(p.id) };
  };
  const state = { list };
  const m = new PluginManager(
    host,
    make,
    async () => state.list,
    async (id) => `/* ${id} */`,
  );
  return { m, started, disposed, state, ports };
}

test("sync starts enabled plugins and stops ones turned off", async () => {
  const r = rig([info("a", true), info("b", false)]);
  await r.m.sync();
  expect(r.started).toEqual(["a"]);
  r.state.list = [info("a", false), info("b", true)];
  await r.m.sync();
  expect(r.disposed).toEqual(["a"]);
  expect(r.started).toEqual(["a", "b"]);
});

test("hasGate only when a running plugin holds input:gate", async () => {
  const r = rig([info("a", true, ["screen:read"])]);
  await r.m.sync();
  expect(r.m.hasGate()).toBe(false);
  r.state.list.push(info("g", true, ["input:gate"]));
  await r.m.sync();
  expect(r.m.hasGate()).toBe(true);
});

test("gate asks every plugin; the first confirm names its plugin", async () => {
  const r = rig([info("g", true, ["input:gate"])]);
  await r.m.sync();
  const p = r.m.gate("rm -rf ~");
  r.ports.get("g")!.onmessage!({
    data: { type: "verdict", id: 1, verdict: "confirm", reason: "home" },
  });
  await expect(p).resolves.toEqual({
    verdict: "confirm",
    reason: "home",
    plugin: "g",
  });
});

test("the sandbox page and worker prelude never contain plugin code", () => {
  // Both are constants; plugin source only ever travels as message data.
  expect(SRCDOC).not.toMatch(/PLUGIN_CODE|\$\{/);
  expect(PRELUDE).toContain("importScripts(e.data.plugin)");
  expect(SRCDOC).toContain("default-src 'none'");
});

test("Enter waits for plugins that are still loading", async () => {
  let release!: () => void;
  const r = rig([info("g", true, ["input:gate"])]);
  const m = new PluginManager(
    host,
    (p, code, h) => {
      void code;
      void h;
      const port: Port = {
        postMessage: vi.fn(),
        onmessage: null,
        close: vi.fn(),
      };
      r.ports.set(p.id, port);
      return {
        broker: new PluginBroker(p.id, p.name, p.permissions, port, {
          screen: () => [],
          showOverlay: vi.fn(),
          hideOverlay: vi.fn(),
          insert: vi.fn(),
          onStopped: vi.fn(),
        }),
        dispose: () => {},
      };
    },
    () =>
      new Promise((res) => {
        release = () => res([info("g", true, ["input:gate"])]);
      }),
    async () => "",
  );
  const syncing = m.sync();
  expect(m.hasGate()).toBe(true); // unknown yet: hold Enter
  const verdict = m.gate("rm -rf ~");
  release();
  await syncing;
  await new Promise((res) => setTimeout(res, 0)); // gate() resumes and asks
  // once loaded, the guard is asked and its answer used
  expect(r.ports.get("g")!.postMessage).toHaveBeenCalledWith({
    type: "gate",
    id: 1,
    line: "rm -rf ~",
  });
  r.ports.get("g")!.onmessage!({
    data: { type: "verdict", id: 1, verdict: "confirm", reason: "home" },
  });
  await expect(verdict).resolves.toMatchObject({ verdict: "confirm" });
});
