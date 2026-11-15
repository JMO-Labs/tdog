import { fold } from "./ingest";
import type { JournalEvent, JournalRecord } from "./types";

export interface JournalDB {
  /** Idempotent: events with seq <= the pane's high-water mark are ignored. */
  apply(pane: string, evs: JournalEvent[]): Promise<void>;
  records(pane?: string): AsyncIterable<JournalRecord>;
  forget(pane: string): Promise<void>;
}

/** In-memory impl for tests (jsdom has no IndexedDB). */
export function memJournal(): JournalDB {
  const recs = new Map<string, JournalRecord>();
  const hi = new Map<string, number>();
  const key = (p: string, r: string) => JSON.stringify([p, r]);
  return {
    async apply(pane, evs) {
      for (const ev of evs) {
        if (ev.seq <= (hi.get(pane) ?? 0)) continue;
        hi.set(pane, ev.seq);
        const k = key(pane, ev.rec);
        recs.set(k, fold(recs.get(k), ev, pane));
      }
    },
    async *records(pane) {
      for (const r of [...recs.values()]) if (!pane || r.pane === pane) yield r;
    },
    async forget(pane) {
      hi.delete(pane);
      for (const [k, r] of recs) if (r.pane === pane) recs.delete(k);
    },
  };
}

const done = (t: IDBTransaction) =>
  new Promise<void>((ok, bad) => {
    t.oncomplete = () => ok();
    t.onerror = t.onabort = () => bad(t.error);
  });
const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, bad) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });

/** IndexedDB impl: db `tdog-journal` v1; `records` [pane,rec], `meta` by pane. */
export function idbJournal(): JournalDB {
  const opened = new Promise<IDBDatabase>((ok, bad) => {
    const o = indexedDB.open("tdog-journal", 1);
    o.onupgradeneeded = () => {
      const d = o.result;
      d.createObjectStore("records", { keyPath: ["pane", "rec"] }).createIndex(
        "pane",
        "pane",
      );
      d.createObjectStore("meta");
    };
    o.onsuccess = () => ok(o.result);
    o.onerror = () => bad(o.error);
  });
  return {
    async apply(pane, evs) {
      const t = (await opened).transaction(["records", "meta"], "readwrite");
      const recs = t.objectStore("records");
      const meta = t.objectStore("meta");
      let hi = ((await req(meta.get(pane))) as number | undefined) ?? 0;
      const cur = new Map<string, JournalRecord | undefined>();
      for (const ev of evs) {
        if (ev.seq <= hi) continue;
        hi = ev.seq;
        if (!cur.has(ev.rec))
          cur.set(ev.rec, await req(recs.get([pane, ev.rec])));
        cur.set(ev.rec, fold(cur.get(ev.rec), ev, pane));
      }
      for (const r of cur.values()) recs.put(r);
      meta.put(hi, pane);
      await done(t);
    },
    async *records(pane) {
      const t = (await opened).transaction("records");
      const s = t.objectStore("records");
      const all = await req(pane ? s.index("pane").getAll(pane) : s.getAll());
      yield* all as JournalRecord[];
    },
    async forget(pane) {
      const t = (await opened).transaction(["records", "meta"], "readwrite");
      const range = IDBKeyRange.bound([pane, ""], [pane, "￿"]);
      t.objectStore("records").delete(range);
      t.objectStore("meta").delete(pane);
      await done(t);
    },
  };
}

let shared: JournalDB | null | undefined;
/** Process-wide db, or null where IndexedDB is unavailable. */
export function journalDB(): JournalDB | null {
  if (shared === undefined)
    shared = typeof indexedDB === "undefined" ? null : idbJournal();
  return shared;
}
