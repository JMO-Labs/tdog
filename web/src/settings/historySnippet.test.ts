import { expect, test } from "vitest";
import { SSH_SNIPPET_BASH, SSH_SNIPPET_ZSH } from "./historySnippet";

test.each([
  ["bash", SSH_SNIPPET_BASH],
  ["zsh", SSH_SNIPPET_ZSH],
])("%s snippet emits all four OSC 133 markers", (_n, s) => {
  for (const m of ["133;A", "133;B", "133;C", "133;D"]) expect(s).toContain(m);
});
