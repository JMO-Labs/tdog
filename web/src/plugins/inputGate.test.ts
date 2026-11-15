import { describe, expect, test, vi } from "vitest";
import {
  createInputGate,
  enterIndex,
  visible,
  type GateDeps,
} from "./inputGate";
import type { GateResult } from "./PluginManager";

const flush = () => new Promise((r) => setTimeout(r, 0));

function rig(over: Partial<GateDeps> = {}) {
  const out: string[] = [];
  const deps: GateDeps = {
    hasGate: () => true,
    gate: vi.fn(async (): Promise<GateResult> => ({
      verdict: "allow",
      reason: "",
    })),
    observe: vi.fn(),
    currentLine: () => "user@box:~$ rm -rf ~",
    confirm: vi.fn(async () => false),
    ...over,
  };
  const feed = createInputGate(deps, (s) => void out.push(s));
  return { feed, out, deps };
}
const confirmVerdict = async (): Promise<GateResult> => ({
  verdict: "confirm",
  reason: "deletes home",
  plugin: "Careful commands",
});

describe("helpers", () => {
  test("Enter inside a bracketed paste is not a run", () => {
    expect(enterIndex("ls\r")).toBe(2);
    expect(enterIndex("\x1b[200~a\rb\x1b[201~")).toBe(-1);
    expect(enterIndex("\x1b[200~a\x1b[201~\r")).toBe(13);
  });
  test("visible drops escapes and controls", () => {
    expect(visible("\x1b[200~rm -rf ~\x1b[201~")).toBe("rm -rf ~");
    expect(visible("ab\x1b[Dc\x7f")).toBe("abc");
  });
});

describe("gate", () => {
  test("typing without Enter passes straight through", () => {
    const { feed, out, deps } = rig();
    feed("rm -rf ~");
    expect(out).toEqual(["rm -rf ~"]);
    expect(deps.gate).not.toHaveBeenCalled();
  });

  test("no gate plugins: Enter goes at once", () => {
    const { feed, out, deps } = rig({ hasGate: () => false });
    feed("\r");
    expect(out).toEqual(["\r"]);
    expect(deps.gate).not.toHaveBeenCalled();
    expect(deps.observe).toHaveBeenCalledWith("user@box:~$ rm -rf ~");
  });

  test("allowed: Enter is sent after the plugins answer", async () => {
    const { feed, out, deps } = rig();
    feed("\r");
    expect(out).toEqual([""]);
    expect(deps.gate).toHaveBeenCalledWith("user@box:~$ rm -rf ~");
    await flush();
    expect(out.join("")).toBe("\r");
  });

  test("confirm → Cancel clears the line and never sends Enter", async () => {
    const { feed, out, deps } = rig({ gate: vi.fn(confirmVerdict) });
    feed("\r");
    await flush();
    expect(deps.confirm).toHaveBeenCalledWith(
      "Careful commands",
      "deletes home",
    );
    expect(out.join("")).toBe("\x15");
    expect(deps.observe).not.toHaveBeenCalled();
  });

  test("confirm → Run anyway sends Enter", async () => {
    const { feed, out } = rig({
      gate: vi.fn(confirmVerdict),
      confirm: vi.fn(async () => true),
    });
    feed("\r");
    await flush();
    expect(out.join("")).toBe("\r");
  });

  test("input typed while a command is held waits its turn", async () => {
    let answer!: (v: GateResult) => void;
    const { feed, out } = rig({
      gate: vi.fn(() => new Promise<GateResult>((r) => (answer = r))),
    });
    feed("\r");
    feed("ls");
    expect(out.join("")).toBe("");
    answer({ verdict: "allow", reason: "" });
    await flush();
    expect(out.join("")).toBe("\rls");
  });

  test("a multi-line paste is checked line by line, each Enter gated", async () => {
    const { feed, deps } = rig({ currentLine: () => "$ " });
    feed("ls\rrm -rf ~\r");
    await flush();
    await flush();
    expect(vi.mocked(deps.gate).mock.calls.map((c) => c[0])).toEqual([
      "$ \nls",
      "$ \nrm -rf ~",
    ]);
  });
});
