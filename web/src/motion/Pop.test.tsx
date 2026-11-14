import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rm = vi.hoisted(() => ({ value: false }));
vi.mock("motion/react", async (orig) => ({
  ...(await orig<typeof import("motion/react")>()),
  useReducedMotion: () => rm.value,
}));
import { Pop } from "./Pop";

beforeEach(() => {
  rm.value = false;
});

describe("Pop", () => {
  it("renders children", () => {
    render(<Pop>hello</Pop>);
    expect(screen.getByText("hello")).toBeTruthy();
  });
  it("renders nothing when show is false", () => {
    render(<Pop show={false}>hello</Pop>);
    expect(screen.queryByText("hello")).toBeNull();
  });
  it("renders under reduced motion", () => {
    rm.value = true;
    render(<Pop>calm</Pop>);
    expect(screen.getByText("calm")).toBeTruthy();
  });
});
