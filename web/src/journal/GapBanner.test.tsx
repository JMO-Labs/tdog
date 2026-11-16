import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { memJournal } from "./db";
import { ingest } from "./ingest";
import { GapBanner } from "./GapBanner";
import type { JournalEvent } from "./types";

const at = "2026-01-01T00:00:00Z";
const gap = (seq: number, rec: number, why: string): JournalEvent => ({
  seq,
  kind: "gap",
  rec,
  why,
  at,
});

afterEach(() => vi.useRealTimers());

it("offers restore on a disconnected gap and hides after the restored out", async () => {
  vi.useFakeTimers();
  const restore = vi.fn();
  const db = memJournal();
  render(<GapBanner pane="p" onRestore={restore} />);
  expect(screen.queryByRole("status")).toBeNull();
  await act(() => ingest(db, "other", "s", [gap(1, 7, "disconnected")]));
  expect(screen.queryByRole("status")).toBeNull();
  await act(() => ingest(db, "p", "s", [gap(1, 7, "disconnected")]));
  expect(
    screen.getByText("Output while disconnected isn't in history."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Restore from host" }));
  expect(restore).toHaveBeenCalledWith(7);
  expect(screen.getByText("Restoring…")).toBeTruthy();
  await act(() =>
    ingest(db, "p", "s", [{ seq: 2, kind: "out", rec: 7, text: "x\n", at }]),
  );
  expect(screen.getByText("Restored from host.")).toBeTruthy();
  act(() => void vi.advanceTimersByTime(5000));
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows the failure text, and can be dismissed", async () => {
  vi.useFakeTimers();
  const db = memJournal();
  render(<GapBanner pane="p" onRestore={vi.fn()} />);
  await act(() => ingest(db, "p", "s", [gap(1, 3, "disconnected")]));
  fireEvent.click(screen.getByRole("button", { name: "Restore from host" }));
  const why = "restore failed: scrollback no longer reaches the gap";
  await act(() => ingest(db, "p", "s", [gap(2, 4, why)]));
  expect(screen.getByText(why)).toBeTruthy();
  act(() => void vi.advanceTimersByTime(10000));
  expect(screen.queryByRole("status")).toBeNull();
  await act(() => ingest(db, "p", "s", [gap(3, 5, "disconnected")]));
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("status")).toBeNull();
});

it("returns to the offer with a note when no result arrives in 30 s", async () => {
  vi.useFakeTimers();
  const restore = vi.fn();
  const db = memJournal();
  render(<GapBanner pane="p" onRestore={restore} />);
  await act(() => ingest(db, "p", "s", [gap(1, 9, "disconnected")]));
  fireEvent.click(screen.getByRole("button", { name: "Restore from host" }));
  act(() => void vi.advanceTimersByTime(29_000));
  expect(screen.getByText("Restoring…")).toBeTruthy();
  act(() => void vi.advanceTimersByTime(1_000));
  expect(screen.getByText(/No reply from the host/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Restore from host" }));
  expect(restore).toHaveBeenLastCalledWith(9);
  expect(restore).toHaveBeenCalledTimes(2);
});
