import { describe, expect, it } from "vitest";
import { pickRenderer } from "./select";

describe("pickRenderer", () => {
  it.each([
    ["", "xterm"],
    ["?renderer=xterm", "xterm"],
    ["?renderer=restty", "restty"],
    ["?renderer=bogus", "xterm"],
    ["?renderer=RESTTY", "xterm"],
    ["?other=1", "xterm"],
  ])("%s -> %s", (q, want) => {
    expect(pickRenderer(q)).toBe(want);
  });
});
