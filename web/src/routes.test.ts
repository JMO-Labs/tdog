import { expect, it } from "vitest";
import { isBenchRoute } from "./routes";

it("/bench only in dev", () => {
  expect(isBenchRoute(true, "/bench")).toBe(true);
  expect(isBenchRoute(true, "/bench/")).toBe(true);
  expect(isBenchRoute(false, "/bench")).toBe(false);
  expect(isBenchRoute(true, "/")).toBe(false);
  expect(isBenchRoute(true, "/benchmark")).toBe(false);
});
