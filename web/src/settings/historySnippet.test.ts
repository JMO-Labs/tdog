import { expect, test } from "vitest";
import { SSH_SNIPPET_BASH, SSH_SNIPPET_ZSH } from "./historySnippet";

test.each([
  ["bash", SSH_SNIPPET_BASH],
  ["zsh", SSH_SNIPPET_ZSH],
])("%s snippet emits all four OSC 133 markers and is source-once", (_n, s) => {
  for (const m of ["133;A", "133;B", "133;C", "133;D"]) expect(s).toContain(m);
  expect(s).toContain('[ -z "$__tdog_osc133" ]');
  expect(s).toContain("__tdog_osc133=1");
});

test("bash snippet prepends to the user's PROMPT_COMMAND", () => {
  expect(SSH_SNIPPET_BASH).toContain("${PROMPT_COMMAND:+");
  expect(SSH_SNIPPET_BASH).toContain("BASH_VERSINFO");
});

test("zsh snippet appends to hook arrays", () => {
  expect(SSH_SNIPPET_ZSH).toContain(
    "precmd_functions=(__tdog_precmd $precmd_functions)",
  );
  expect(SSH_SNIPPET_ZSH).toContain("preexec_functions+=");
});
