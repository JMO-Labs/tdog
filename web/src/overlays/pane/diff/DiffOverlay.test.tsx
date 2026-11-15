import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DiffOverlay } from "./DiffOverlay";
import type { PaneOverlayContext } from "../../../terminal/renderer";

// Mock the API
vi.mock("../../../auth/api", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "../../../auth/api";

describe("DiffOverlay", () => {
  const mockCtx: PaneOverlayContext = {
    screen: [],
    cellGeometry: { cellWidth: 8, cellHeight: 16, offsetX: 0, offsetY: 0 },
    insert: vi.fn(),
    copy: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    sessionId: "test-session",
    cwd: "/home/user",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form initially", () => {
    render(<DiffOverlay {...mockCtx} />);
    expect(screen.getByText("Diff Two Files")).toBeTruthy();
    expect(screen.getAllByPlaceholderText(/Absolute path/).length).toBe(2);
  });

  it("shows cwd in form", () => {
    render(<DiffOverlay {...mockCtx} />);
    expect(screen.getByText(/Current directory: \/home\/user/)).toBeTruthy();
  });

  it("validates paths before submitting", () => {
    render(<DiffOverlay {...mockCtx} />);
    const inputs = screen.getAllByPlaceholderText(/Absolute path/);
    fireEvent.change(inputs[0], { target: { value: "." } });
    fireEvent.change(inputs[1], { target: { value: "/tmp/file" } });

    const compareBtn = screen.getByText("Compare");
    fireEvent.click(compareBtn);

    // Should show error for relative path
    expect(screen.getByText(/Relative paths/)).toBeTruthy();
  });

  it("calls apiPost on valid form submission", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        a: { path: "/tmp/a", size: 100 },
        b: { path: "/tmp/b", size: 100 },
        hunks: [],
      }),
    };
    vi.mocked(apiPost).mockResolvedValue(mockResponse as any);

    render(<DiffOverlay {...mockCtx} />);
    const inputs = screen.getAllByPlaceholderText(/Absolute path/);
    fireEvent.change(inputs[0], { target: { value: "/tmp/a" } });
    fireEvent.change(inputs[1], { target: { value: "/tmp/b" } });

    const compareBtn = screen.getByText("Compare");
    fireEvent.click(compareBtn);

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/api/diff", {
        session: "test-session",
        a: "/tmp/a",
        b: "/tmp/b",
        context: 3,
      });
    });
  });

  it("handles 404 error", async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      text: async () => "file not found",
    };
    vi.mocked(apiPost).mockResolvedValue(mockResponse as any);

    render(<DiffOverlay {...mockCtx} />);
    const inputs = screen.getAllByPlaceholderText(/Absolute path/);
    fireEvent.change(inputs[0], { target: { value: "/tmp/a" } });
    fireEvent.change(inputs[1], { target: { value: "/tmp/b" } });

    const compareBtn = screen.getByText("Compare");
    fireEvent.click(compareBtn);

    await waitFor(() => {
      expect(screen.getByText(/File not found/)).toBeTruthy();
    });
  });

  it("handles 413 error", async () => {
    const mockResponse = {
      ok: false,
      status: 413,
      text: async () => "file too large",
    };
    vi.mocked(apiPost).mockResolvedValue(mockResponse as any);

    render(<DiffOverlay {...mockCtx} />);
    const inputs = screen.getAllByPlaceholderText(/Absolute path/);
    fireEvent.change(inputs[0], { target: { value: "/tmp/a" } });
    fireEvent.change(inputs[1], { target: { value: "/tmp/b" } });

    const compareBtn = screen.getByText("Compare");
    fireEvent.click(compareBtn);

    await waitFor(() => {
      expect(screen.getByText(/Files too large/)).toBeTruthy();
    });
  });

  it("handles 415 error", async () => {
    const mockResponse = {
      ok: false,
      status: 415,
      text: async () => "binary file",
    };
    vi.mocked(apiPost).mockResolvedValue(mockResponse as any);

    render(<DiffOverlay {...mockCtx} />);
    const inputs = screen.getAllByPlaceholderText(/Absolute path/);
    fireEvent.change(inputs[0], { target: { value: "/tmp/a" } });
    fireEvent.change(inputs[1], { target: { value: "/tmp/b" } });

    const compareBtn = screen.getByText("Compare");
    fireEvent.click(compareBtn);

    await waitFor(() => {
      expect(screen.getByText(/Binary file/)).toBeTruthy();
    });
  });

  it("handles 429 error", async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      text: async () => "too many requests",
    };
    vi.mocked(apiPost).mockResolvedValue(mockResponse as any);

    render(<DiffOverlay {...mockCtx} />);
    const inputs = screen.getAllByPlaceholderText(/Absolute path/);
    fireEvent.change(inputs[0], { target: { value: "/tmp/a" } });
    fireEvent.change(inputs[1], { target: { value: "/tmp/b" } });

    const compareBtn = screen.getByText("Compare");
    fireEvent.click(compareBtn);

    await waitFor(() => {
      expect(screen.getByText(/Server busy/)).toBeTruthy();
    });
  });

  it("shows diff view with hunks", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        a: { path: "/tmp/a", size: 100 },
        b: { path: "/tmp/b", size: 100 },
        hunks: [
          {
            aStart: 1,
            aLines: 2,
            bStart: 1,
            bLines: 2,
            lines: [
              { op: " " as const, text: "same" },
              { op: "-" as const, text: "removed" },
              { op: "+" as const, text: "added" },
            ],
          },
        ],
      }),
    };
    vi.mocked(apiPost).mockResolvedValue(mockResponse as any);

    render(<DiffOverlay {...mockCtx} />);
    const inputs = screen.getAllByPlaceholderText(/Absolute path/);
    fireEvent.change(inputs[0], { target: { value: "/tmp/a" } });
    fireEvent.change(inputs[1], { target: { value: "/tmp/b" } });

    const compareBtn = screen.getByText("Compare");
    fireEvent.click(compareBtn);

    await waitFor(() => {
      expect(screen.getByText(/Diff/)).toBeTruthy();
      expect(screen.getByText(/removed/)).toBeTruthy();
      expect(screen.getByText(/added/)).toBeTruthy();
    });
  });
});
