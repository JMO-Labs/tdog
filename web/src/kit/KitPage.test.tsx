import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { isKitRoute } from "../routes";
import { KitPage } from "./KitPage";

test("kit route is dev-only", () => {
  expect(isKitRoute(true, "/kit")).toBe(true);
  expect(isKitRoute(true, "/kit/")).toBe(true);
  expect(isKitRoute(false, "/kit")).toBe(false);
  expect(isKitRoute(true, "/kitten")).toBe(false);
});

test("kit page renders every component in both themes", () => {
  const { container } = render(<KitPage />);
  expect(container.querySelectorAll("[data-theme]")).toHaveLength(2);
  expect(screen.getAllByRole("switch")).toHaveLength(4);
  expect(screen.getAllByRole("slider")).toHaveLength(2);
  expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
  expect(screen.getAllByRole("combobox")).toHaveLength(2);
  expect(screen.getAllByText("Primary")).toHaveLength(2);
});
