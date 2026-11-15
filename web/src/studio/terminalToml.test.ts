import { expect, test } from "vitest";
import { parseTerminal, serializeTerminal } from "./terminalToml";

test("round-trips a full preset", () => {
  const p = {
    name: "api",
    target: "container",
    cwd: "/srv",
    persistent: true,
    env: [{ key: "NODE_ENV", value: "dev" }],
    pre_exec: { mode: "stop_on_fail" as const, run: ["a", "b"] },
    command: "npm run dev",
    on_close: { mode: "all" as const, run: ['echo "bye"'] },
    theme: "dracula",
    font: { family: "VT323", size: 14, ligatures: false },
    background: { kind: "color", ref: "#000", opacity: 0.5, blur: 3 },
  };
  expect(parseTerminal(serializeTerminal(p))).toEqual(p);
});

test("parses string-shorthand hooks, comments and quoted keys", () => {
  const p = parseTerminal(
    `# c\nname = "x" # tail\npre_exec = "echo #1"\n[env]\n"A B" = 'v'\n`,
  );
  expect(p.name).toBe("x");
  expect(p.pre_exec).toEqual({ mode: "all", run: ["echo #1"] });
  expect(p.env).toEqual([{ key: "A B", value: "v" }]);
});

test("omits empty fields and blank env rows", () => {
  expect(
    serializeTerminal({ name: "n", cwd: "", env: [{ key: "", value: "x" }] }),
  ).toBe('name = "n"\n');
});

test("rejects unsupported syntax", () => {
  expect(() => parseTerminal("[[x]]\n")).toThrow(/line 1/);
  expect(() => parseTerminal("a = {b=1}\n")).toThrow(/line 1/);
});
