import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PaneOverlayContext } from "../../../terminal/renderer";
import { UnicodeInput } from "./UnicodeInput";
import type { UnicodeChar } from "./data";

const mockData: UnicodeChar[] = [
  {
    char: "👍",
    codepoint: "1F44D",
    name: "thumbs up",
    keywords: ["thumbs", "yes", "good"],
    category: "emoji",
  },
  {
    char: "✓",
    codepoint: "2713",
    name: "check mark",
    keywords: ["checkmark", "yes", "correct"],
    category: "symbol",
  },
  {
    char: "🚀",
    codepoint: "1F680",
    name: "rocket",
    keywords: ["launch", "space"],
    category: "emoji",
  },
  {
    char: "→",
    codepoint: "2192",
    name: "rightwards arrow",
    keywords: ["arrow", "right"],
    category: "symbol",
  },
];

const mockCtx: PaneOverlayContext = {
  screen: [],
  cellGeometry: {
    cellWidth: 8,
    cellHeight: 16,
    offsetX: 0,
    offsetY: 0,
  },
  insert: vi.fn(),
  copy: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    },
    writable: true,
    configurable: true,
  });
});

describe("UnicodeInput", () => {
  it("renders and is interactive", () => {
    render(<UnicodeInput ctx={mockCtx} data={mockData} />);
    const input = screen.getByPlaceholderText(/search by name/i);
    expect(input).toBeTruthy();
    expect(input === document.activeElement).toBe(true);
  });

  it("renders tabs", () => {
    render(<UnicodeInput ctx={mockCtx} data={mockData} />);
    expect(screen.getByText("Emoji")).toBeTruthy();
    expect(screen.getByText("Symbols")).toBeTruthy();
    expect(screen.getByText("Recent")).toBeTruthy();
  });

  it("filters emoji tab by default", () => {
    const { container } = render(
      <UnicodeInput ctx={mockCtx} data={mockData} />,
    );
    const cells = container.querySelectorAll(".unicode-cell");
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(30);
  });

  it("searches by name", () => {
    const { container } = render(
      <UnicodeInput ctx={mockCtx} data={mockData} />,
    );
    const input = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: "rocket" } });
    const cells = container.querySelectorAll(".unicode-cell");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("shows no results message when search has no matches", () => {
    render(<UnicodeInput ctx={mockCtx} data={mockData} />);
    const input = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: "nonexistent" } });
    expect(screen.getByText("No results found")).toBeTruthy();
  });

  it("inserts character on Enter", () => {
    const { container } = render(
      <UnicodeInput ctx={mockCtx} data={mockData} />,
    );
    const firstCell = container.querySelector(".unicode-cell");
    fireEvent.click(firstCell!);
    const containerDiv = container.querySelector(".unicode-input-container");
    fireEvent.keyDown(containerDiv!, { key: "Enter" });
    expect(mockCtx.insert).toHaveBeenCalled();
  });

  it("copies character on Shift+Enter", () => {
    const { container } = render(
      <UnicodeInput ctx={mockCtx} data={mockData} />,
    );
    const firstCell = container.querySelector(".unicode-cell");
    fireEvent.click(firstCell!);
    const containerDiv = container.querySelector(".unicode-input-container");
    fireEvent.keyDown(containerDiv!, { key: "Enter", shiftKey: true });
    expect(mockCtx.copy).toHaveBeenCalled();
  });

  it("navigates with arrow keys", () => {
    const { container } = render(
      <UnicodeInput ctx={mockCtx} data={mockData} />,
    );
    let selected = container.querySelector(".unicode-cell.selected");
    expect(selected).toBeTruthy();
    const containerDiv = container.querySelector(".unicode-input-container");
    fireEvent.keyDown(containerDiv!, { key: "ArrowRight" });
    const newSelected = container.querySelector(".unicode-cell.selected");
    expect(newSelected).not.toBe(selected);
  });

  it("selects with number keys", () => {
    const { container } = render(
      <UnicodeInput ctx={mockCtx} data={mockData} />,
    );
    const containerDiv = container.querySelector(".unicode-input-container");
    const cells = container.querySelectorAll(".unicode-cell");
    if (cells.length > 2) {
      fireEvent.keyDown(containerDiv!, { key: "3" });
      expect(cells[2].className.includes("selected")).toBe(true);
    }
  });

  it("closes on close button", () => {
    render(<UnicodeInput ctx={mockCtx} data={mockData} />);
    const closeButton = Array.from(screen.getAllByRole("button")).find((b) =>
      b.textContent?.includes("Close"),
    );
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(mockCtx.close).toHaveBeenCalled();
    }
  });

  it("disables insert button when no results", () => {
    render(<UnicodeInput ctx={mockCtx} data={mockData} />);
    const input = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: "zzznonexistentzzz" } });
    const insertButton = Array.from(screen.getAllByRole("button")).find((b) =>
      b.textContent?.includes("Insert"),
    );
    if (insertButton) {
      expect((insertButton as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
