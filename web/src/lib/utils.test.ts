import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy and conditional values", () => {
    expect(cn("a", false && "b", undefined, null, { c: true, d: false })).toBe(
      "a c",
    );
  });

  it("lets later tailwind classes override earlier conflicting ones", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
