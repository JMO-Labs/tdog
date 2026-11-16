import { expect, it } from "vitest";
import { wsUrl } from "./useTerminalSession";

it("sends the pane key alongside scene and id", () => {
  const u = new URL(wsUrl("sc", "i1", undefined, "p-1"));
  expect(u.searchParams.get("pane")).toBe("p-1");
  expect(u.searchParams.get("scene")).toBe("sc");
  expect(new URL(wsUrl("sc")).searchParams.has("pane")).toBe(false);
});
