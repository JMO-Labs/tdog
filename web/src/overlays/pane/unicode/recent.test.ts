import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRecent, addRecent, clearRecent } from "./recent";

// Mock localStorage
const mockStorage: Record<string, string> = {};

beforeEach(() => {
  mockStorage["tdog.unicodeRecent"] = undefined as any;
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
      },
      length: 0,
      key: () => null,
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  clearRecent();
});

describe("recent", () => {
  it("returns empty list when nothing stored", () => {
    expect(getRecent()).toEqual([]);
  });

  it("adds a codepoint", () => {
    addRecent("1F44D");
    expect(getRecent()).toEqual(["1F44D"]);
  });

  it("keeps newest first", () => {
    addRecent("1F44D");
    addRecent("2713");
    expect(getRecent()).toEqual(["2713", "1F44D"]);
  });

  it("deduplicates when adding existing codepoint", () => {
    addRecent("1F44D");
    addRecent("2713");
    addRecent("1F44D");
    expect(getRecent()).toEqual(["1F44D", "2713"]);
  });

  it("respects max 30 items", () => {
    for (let i = 0; i < 35; i++) {
      addRecent(`000${i}`);
    }
    const recent = getRecent();
    expect(recent.length).toBe(30);
    expect(recent[0]).toBe("00034");
  });

  it("clears recent list", () => {
    addRecent("1F44D");
    addRecent("2713");
    clearRecent();
    expect(getRecent()).toEqual([]);
  });

  it("handles invalid stored data gracefully", () => {
    mockStorage["tdog.unicodeRecent"] = "invalid json";
    expect(getRecent()).toEqual([]);
  });

  it("handles invalid array data gracefully", () => {
    mockStorage["tdog.unicodeRecent"] = JSON.stringify([123, "valid"]);
    expect(getRecent()).toEqual([]);
  });

  it("handles localStorage unavailability on add", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage full");
    });
    expect(() => addRecent("1F44D")).not.toThrow();
  });

  it("handles localStorage unavailability on get", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Access denied");
    });
    expect(getRecent()).toEqual([]);
  });
});
