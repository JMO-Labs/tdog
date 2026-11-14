import { describe, expect, it } from "vitest";
import { initial, next, STEPS, label } from "./signon";

describe("sign-on state machine", () => {
  it("walks dialing → verifying → connected → done", () => {
    let p = initial;
    expect(p).toBe("idle");
    const seen = [];
    for (let i = 0; i < 4; i++) seen.push((p = next(p)));
    expect(seen).toEqual(["dialing", "verifying", "connected", "done"]);
  });
  it("done is terminal", () => {
    expect(next("done")).toBe("done");
  });
  it("labels the three steps", () => {
    expect(STEPS.map(label)).toEqual([
      "Dialing…",
      "Verifying password…",
      "Connected!",
    ]);
  });
});
