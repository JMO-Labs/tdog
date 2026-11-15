import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ingest } from "./ingest";
import { memJournal } from "./db";
import { useJournalMarkers } from "./useJournalMarkers";

it("a resent start does not re-mark; live markers are never overwritten", async () => {
  const markLine = vi.fn(() => ({
    line: 1,
    isDisposed: false,
    dispose: vi.fn(),
  }));
  renderHook(() =>
    useJournalMarkers("p", { current: { markLine } as never }, vi.fn()),
  );
  const db = memJournal();
  const ev = (seq: number) => ({
    seq,
    kind: "start" as const,
    rec: 1,
    cmd: "x",
    at: "2026-01-01T00:00:00Z",
  });
  await ingest(db, "p", "A", [ev(1)]);
  await ingest(db, "p", "A", [ev(1)]);
  expect(markLine).toHaveBeenCalledTimes(1);
});
