import { describe, expect, it } from "vitest";
import { generateLabels } from "./labelGenerator";

describe("labelGenerator", () => {
  it("generates single-letter labels first", () => {
    const labels = generateLabels(5);
    expect(labels).toEqual(["a", "s", "d", "f", "j"]);
  });

  it("uses home row letters first", () => {
    const labels = generateLabels(8);
    expect(labels).toEqual(["a", "s", "d", "f", "j", "k", "l", ";"]);
  });

  it("generates two-letter labels after home row", () => {
    const labels = generateLabels(10);
    expect(labels).toHaveLength(10);
    expect(labels.slice(0, 8)).toEqual([
      "a",
      "s",
      "d",
      "f",
      "j",
      "k",
      "l",
      ";",
    ]);
    expect(labels[8]).toBe("aa");
    expect(labels[9]).toBe("ab");
  });

  it("handles 0 labels", () => {
    const labels = generateLabels(0);
    expect(labels).toEqual([]);
  });

  it("handles exactly 8 labels (home row)", () => {
    const labels = generateLabels(8);
    expect(labels).toHaveLength(8);
    expect(labels).toEqual(["a", "s", "d", "f", "j", "k", "l", ";"]);
  });

  it("generates many labels", () => {
    const labels = generateLabels(100);
    expect(labels).toHaveLength(100);
    expect(labels.slice(0, 8)).toEqual([
      "a",
      "s",
      "d",
      "f",
      "j",
      "k",
      "l",
      ";",
    ]);
    // Check that two-letter labels are generated properly
    expect(labels.filter((l) => l.length === 2)).toHaveLength(92);
  });

  it("generates unique labels", () => {
    const labels = generateLabels(50);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});
