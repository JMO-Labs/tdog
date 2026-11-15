import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GATE_TIMEOUT_MS,
  MAX_MESSAGES_PER_SEC,
  PluginBroker,
  type BrokerHost,
  type Port,
} from "./broker";
import { isPlain, parsePluginMessage } from "./schema";
import type { HostToPlugin } from "./schema";

function rig(perms: string[], now = () => 0) {
  const sent: HostToPlugin[] = [];
  const port: Port = {
    postMessage: (m) => void sent.push(m),
    onmessage: null,
    close: vi.fn(),
  };
  const host: BrokerHost = {
    screen: vi.fn(() => ["$ ls"]),
    showOverlay: vi.fn(),
    hideOverlay: vi.fn(),
    insert: vi.fn(),
    onStopped: vi.fn(),
  };
  const b = new PluginBroker("p", "P", perms, port, host, now);
  const from = (data: unknown) => port.onmessage?.({ data });
  return { b, sent, port, host, from };
}
afterEach(() => vi.useRealTimers());

describe("schema", () => {
  test("only plain data passes", () => {
    expect(isPlain({ a: [1, "x", null, { b: true }] })).toBe(true);
    for (const bad of [
      new Map(),
      new Set(),
      new Date(),
      new Uint8Array(2),
      () => 1,
      NaN,
      { m: new Map() },
    ])
      expect(isPlain(bad)).toBe(false);
  });
  test("unknown types, extra keys and HTML-ish nodes are rejected", () => {
    expect(parsePluginMessage({ type: "eval", code: "x" })).toBeNull();
    expect(parsePluginMessage({ type: "ready", extra: 1 })).toBeNull();
    expect(
      parsePluginMessage({
        type: "overlay",
        nodes: [{ kind: "html", html: "<img onerror=x>" }],
      }),
    ).toBeNull();
    expect(
      parsePluginMessage({
        type: "overlay",
        nodes: [{ kind: "text", text: "hi" }],
      }),
    ).toEqual({ type: "overlay", nodes: [{ kind: "text", text: "hi" }] });
  });
});

describe("broker", () => {
  test("gate: no permission → allow without asking the plugin", async () => {
    const { b, sent } = rig([]);
    await expect(b.gate("rm -rf ~")).resolves.toEqual({
      verdict: "allow",
      reason: "",
    });
    expect(sent).toEqual([]);
  });

  test("gate: the plugin's verdict comes back", async () => {
    const { b, sent, from } = rig(["input:gate"]);
    const p = b.gate("rm -rf ~");
    expect(sent[0]).toEqual({ type: "gate", id: 1, line: "rm -rf ~" });
    from({ type: "verdict", id: 1, verdict: "confirm", reason: "careful" });
    await expect(p).resolves.toEqual({ verdict: "confirm", reason: "careful" });
  });

  test("gate: silence past the timeout allows", async () => {
    vi.useFakeTimers();
    const { b, from } = rig(["input:gate"]);
    from({ type: "ready" });
    const p = b.gate("ls");
    vi.advanceTimersByTime(GATE_TIMEOUT_MS + 1);
    await expect(p).resolves.toMatchObject({ verdict: "allow" });
  });

  test("gate: a plugin still starting gets the longer startup wait", async () => {
    vi.useFakeTimers();
    const { b, from } = rig(["input:gate"]);
    let settled = false;
    const p = b.gate("rm -rf ~").then((v) => ((settled = true), v));
    await vi.advanceTimersByTimeAsync(GATE_TIMEOUT_MS + 1);
    expect(settled).toBe(false);
    from({ type: "verdict", id: 1, verdict: "confirm", reason: "late" });
    await expect(p).resolves.toMatchObject({ verdict: "confirm" });
  });

  test("each capability needs its permission", () => {
    const { from, host, sent } = rig([]);
    from({ type: "screen", id: 1 });
    from({ type: "overlay", nodes: [] });
    from({ type: "insert", text: "x" });
    expect(sent).toEqual([]);
    expect(host.showOverlay).not.toHaveBeenCalled();
    expect(host.insert).not.toHaveBeenCalled();
  });

  test("screen:read answers with the focused pane's lines", () => {
    const { from, sent } = rig(["screen:read"]);
    from({ type: "screen", id: 7 });
    expect(sent).toEqual([{ type: "screen", id: 7, lines: ["$ ls"] }]);
  });

  test("insert only right after a click in the plugin's overlay", () => {
    let t = 0;
    const { from, host } = rig(["overlay", "input:insert"], () => t);
    from({ type: "insert", text: "no" });
    expect(host.insert).not.toHaveBeenCalled();
    from({ type: "overlay", nodes: [{ kind: "button", id: "b", text: "Go" }] });
    const onAction = vi.mocked(host.showOverlay).mock.calls[0][2];
    onAction("b");
    t = 500;
    from({ type: "insert", text: "yes" });
    expect(host.insert).toHaveBeenCalledWith("p", "yes");
    from({ type: "insert", text: "again" }); // one insert per click
    expect(host.insert).toHaveBeenCalledTimes(1);
  });

  test("malformed or oversized messages stop the plugin", () => {
    const a = rig([]);
    a.from({ type: "ready", sneaky: new Map() });
    expect(a.b.stopped).toBe(true);
    expect(a.port.close).toHaveBeenCalled();
    const b = rig(["overlay"]);
    b.from({
      type: "overlay",
      nodes: [{ kind: "text", text: "x".repeat(70_000) }],
    });
    expect(b.b.stopped).toBe(true);
    expect(b.host.onStopped).toHaveBeenCalled();
  });

  test("more than the rate limit per second stops the plugin", () => {
    const { b, from } = rig([]);
    for (let i = 0; i <= MAX_MESSAGES_PER_SEC; i++) from({ type: "ready" });
    expect(b.stopped).toBe(true);
  });

  test("stopping answers pending gates with allow", async () => {
    const { b } = rig(["input:gate"]);
    const p = b.gate("x");
    b.stop();
    await expect(p).resolves.toMatchObject({ verdict: "allow" });
  });
});
