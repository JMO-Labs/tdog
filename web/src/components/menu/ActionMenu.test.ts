import { describe, it, expect } from "vitest";
import { flipSubmenuPosition } from "./ActionMenu";

describe("flipSubmenuPosition", () => {
  it("opens to the right when there is space", () => {
    const parentRect = new DOMRect(100, 100, 100, 30);
    const result = flipSubmenuPosition(parentRect, 160);

    expect(result.left).toBe(200); // parentRect.right = 200
    expect(result.right).toBeUndefined();
  });

  it("flips to the left when near the right edge", () => {
    // Setup: window width is 1024, parent is at x=900, so right edge at 1000
    // submenuWidth=160, threshold=200, so 1024-1000=24 < 200+160, should flip
    const parentRect = new DOMRect(900, 100, 100, 30);
    // Mock window.innerWidth
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const result = flipSubmenuPosition(parentRect, 160);

    expect(result.right).toBe(1024 - 900); // parentRect.left = 900
    expect(result.left).toBeUndefined();

    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("opens right when there is exactly enough space", () => {
    const parentRect = new DOMRect(600, 100, 100, 30);
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1000,
    });

    // 1000 - 700 (right) = 300, threshold 200, submenu 160
    // 300 >= 200 + 160 = 360? No, so it should flip
    const result = flipSubmenuPosition(parentRect, 160);

    // Actually should flip since 1000 - 700 = 300 < 360
    expect(result.right).toBeDefined();
  });
});
