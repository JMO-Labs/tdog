import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Hit } from "./search";

type W = {
  onmessage: ((e: { data: unknown }) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};
const workers: W[] = [];
vi.mock("./searchWorker", () => ({
  createSearchWorker: () => {
    const w: W = { onmessage: null, postMessage: vi.fn(), terminate: vi.fn() };
    workers.push(w);
    return w;
  },
}));
import { useJournalSearch } from "./useJournalSearch";

const hit = (at: number, rec = 1): Hit => ({
  pane: "p",
  sid: "s",
  rkey: `s/${rec}`,
  rec,
  cmd: "c",
  at,
  line: "l",
  lineNo: 0,
  inCmd: false,
});
const q = (text: string) => ({ text, regex: false, caseSensitive: false });
beforeEach(() => {
  vi.useFakeTimers();
  workers.length = 0;
});
afterEach(() => vi.useRealTimers());

it("debounces, merges newest-first, drops stale ids, terminates", () => {
  const { result, rerender, unmount } = renderHook(
    ({ t }) => useJournalSearch(q(t)),
    { initialProps: { t: "a" } },
  );
  rerender({ t: "ab" });
  act(() => void vi.advanceTimersByTime(149));
  expect(workers).toHaveLength(0);
  act(() => void vi.advanceTimersByTime(1));
  const w = workers[0];
  const id = w.postMessage.mock.calls[0][0].id;
  act(() => w.onmessage?.({ data: { id, hits: [hit(1), hit(5, 2)] } }));
  act(() => w.onmessage?.({ data: { id: id + 99, hits: [hit(100, 3)] } }));
  act(() => w.onmessage?.({ data: { id, hits: [hit(3, 4)] } }));
  expect(result.current.hits.map((h) => h.at)).toEqual([5, 3, 1]);
  expect(result.current.done).toBe(false);
  act(() => w.onmessage?.({ data: { id, done: true } }));
  expect(result.current.done).toBe(true);
  // new query cancels: resets hits
  rerender({ t: "abc" });
  act(() => void vi.advanceTimersByTime(150));
  expect(result.current.hits).toEqual([]);
  unmount();
  expect(workers.every((x) => x.terminate.mock.calls.length > 0)).toBe(true);
});

it("empty query is done with no worker", () => {
  const { result } = renderHook(() => useJournalSearch(q(" ")));
  act(() => void vi.advanceTimersByTime(200));
  expect(workers).toHaveLength(0);
  expect(result.current).toEqual({ hits: [], done: true });
});
