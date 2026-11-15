import { useEffect, useState } from "react";
import type { Hit, Query } from "./search";
import { createSearchWorker } from "./searchWorker";

type Msg = { id: number; hits?: Hit[]; done?: boolean };
const EMPTY = { hits: [] as Hit[], done: true };
let seq = 0;

/** Debounced (150 ms) search over the journal; hits merge newest-first. */
export function useJournalSearch(q: Query): { hits: Hit[]; done: boolean } {
  const [state, setState] = useState(EMPTY);
  const { text, regex, caseSensitive } = q;
  useEffect(() => {
    if (!text.trim()) {
      setState(EMPTY);
      return;
    }
    const id = ++seq;
    setState({ hits: [], done: false });
    let w: Worker | undefined;
    const t = setTimeout(() => {
      w = createSearchWorker();
      w.onmessage = (e: MessageEvent<Msg>) => {
        const m = e.data;
        if (m.id !== id) return;
        setState((s) => ({
          hits: m.hits
            ? [...s.hits, ...m.hits].sort((a, b) => b.at - a.at)
            : s.hits,
          done: s.done || !!m.done,
        }));
      };
      w.postMessage({ id, q: { text, regex, caseSensitive } });
    }, 150);
    return () => {
      clearTimeout(t);
      w?.terminate();
    };
  }, [text, regex, caseSensitive]);
  return state;
}
