/// <reference lib="webworker" />
import { idbJournal } from "./db";
import { matchRecord, type Hit, type Query } from "./search";

let current = 0;
const BATCH = 50;

async function run(id: number, q: Query) {
  current = id;
  let buf: Hit[] = [];
  const flush = () => {
    if (buf.length) postMessage({ id, hits: buf });
    buf = [];
  };
  try {
    // ponytail: full scan per query; add an index if search gets slow
    for await (const rec of idbJournal().records()) {
      if (current !== id) return;
      buf.push(...matchRecord(rec, q));
      if (buf.length >= BATCH) flush();
    }
  } catch {
    /* db unavailable: report what we have */
  }
  if (current !== id) return;
  flush();
  postMessage({ id, done: true });
}

onmessage = (e: MessageEvent<{ id: number; q: Query }>) =>
  void run(e.data.id, e.data.q);
