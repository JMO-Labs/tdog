import { fold } from "./ingest";
import type { JournalEvent, JournalRecord } from "./types";

export interface JournalDB {
  /**
   * Idempotent per (pane, sid): events with seq <= that session's high-water
   * mark are ignored. A new `sid` (server restarted) resets the mark and
   * keeps the old records. Resolves to the high-water mark before this call
   * (Infinity when the journal is wiped), so callers can tell new events.
   */
  apply(pane: string, sid: string, evs: JournalEvent[]): Promise<number>;
  records(pane?: string): AsyncIterable<JournalRecord>;
  forget(pane: string): Promise<void>;
}

/** Per-pane promise chain so an apply never lands after a later forget. */
function serial() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(pane: string, job: () => Promise<T>): Promise<T> => {
    const run = (tails.get(pane) ?? Promise.resolve()).then(job, job);
    const tail = run.catch(() => {});
    tails.set(pane, tail);
    void tail.then(() => tails.get(pane) === tail && tails.delete(pane));
    return run;
  };
}

/** In-memory impl for tests (jsdom has no IndexedDB). */
export function memJournal(): JournalDB {
  const recs = new Map<string, JournalRecord>();
  const meta = new Map<string, { sid: string; hwm: number }>();
  const q = serial();
  return {
    apply: (pane, sid, evs) =>
      q(pane, async () => {
        if (wiped) return Infinity;
        let m = meta.get(pane);
        if (m?.sid !== sid) m = { sid, hwm: 0 };
        const prev = m.hwm;
        for (const ev of evs) {
          if (ev.seq <= m.hwm) continue;
          m.hwm = ev.seq;
          const k = JSON.stringify([pane, `${sid}/${ev.rec}`]);
          recs.set(k, fold(recs.get(k), ev, pane, sid));
        }
        meta.set(pane, m);
        return prev;
      }),
    async *records(pane) {
      for (const r of [...recs.values()]) if (!pane || r.pane === pane) yield r;
    },
    forget: (pane) =>
      q(pane, async () => {
        meta.delete(pane);
        for (const [k, r] of recs) if (r.pane === pane) recs.delete(k);
      }),
  };
}

const DB = "tdog-journal";
const PAGE = 200;
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

/** Set by wipeJournal; journal stays off until resumeJournal (next sign-in). */
let wiped = false;
export function resumeJournal(): void {
  wiped = false;
}

let opened: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (wiped) return Promise.reject(new Error("journal wiped"));
  opened ??= new Promise<IDBDatabase>((ok, bad) => {
    const o = indexedDB.open(DB, 1);
    o.onupgradeneeded = () => {
      const d = o.result;
      d.createObjectStore("records", {
        keyPath: ["pane", "rkey"],
      }).createIndex("pane", "pane");
      d.createObjectStore("meta", { keyPath: "pane" });
    };
    o.onblocked = () => console.warn("journal: db open blocked");
    o.onsuccess = () => {
      o.result.onversionchange = () => {
        o.result.close();
        opened = undefined;
      };
      ok(o.result);
    };
    o.onerror = () => bad(o.error);
  }).catch((e) => {
    opened = undefined; // let a later call retry
    throw e;
  });
  return opened;
}

/** IndexedDB impl: db `tdog-journal` v1; `records` [pane,rkey], `meta` by pane. */
export function idbJournal(): JournalDB {
  const q = serial();
  return {
    apply: (pane, sid, evs) =>
      q(pane, async () => {
        if (wiped) return Infinity;
        const t = (await open()).transaction(["records", "meta"], "readwrite");
        const recs = t.objectStore("records");
        const meta = t.objectStore("meta");
        const m = (await req(meta.get(pane))) as
          { sid: string; hwm: number } | undefined;
        let hwm = m?.sid === sid ? m.hwm : 0;
        const prev = hwm;
        const cur = new Map<number, JournalRecord | undefined>();
        for (const ev of evs) {
          if (ev.seq <= hwm) continue;
          hwm = ev.seq;
          if (!cur.has(ev.rec))
            cur.set(ev.rec, await req(recs.get([pane, `${sid}/${ev.rec}`])));
          cur.set(ev.rec, fold(cur.get(ev.rec), ev, pane, sid));
        }
        for (const r of cur.values()) recs.put(r);
        meta.put({ pane, sid, hwm });
        await done(t);
        return prev;
      }),
    async *records(pane) {
      // Page by key; a fresh readonly transaction each time so nothing is
      // held open across the consumer's awaits.
      const hi = pane ? [pane, "￿"] : [[], []];
      let last: IDBValidKey = pane ? [pane, ""] : [""];
      let first = true;
      for (;;) {
        const t = (await open()).transaction("records");
        const range = first
          ? IDBKeyRange.bound(last, hi, false, false)
          : IDBKeyRange.bound(last, hi, true, false);
        const rows = (await req(
          t.objectStore("records").getAll(range, PAGE),
        )) as JournalRecord[];
        first = false;
        yield* rows;
        if (rows.length < PAGE) return;
        const l = rows[rows.length - 1];
        last = [l.pane, l.rkey];
      }
    },
    forget: (pane) =>
      q(pane, async () => {
        const t = (await open()).transaction(["records", "meta"], "readwrite");
        t.objectStore("records").delete(
          IDBKeyRange.bound([pane, ""], [pane, "￿"]),
        );
        t.objectStore("meta").delete(pane);
        await done(t);
      }),
  };
}

/** Delete the whole journal database (explicit sign-out only). */
export async function wipeJournal(): Promise<void> {
  wiped = true;
  shared = undefined;
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await opened;
    db?.close();
  } catch {
    /* open failed; nothing to close */
  }
  opened = undefined;
  await new Promise<void>((ok) => {
    const r = indexedDB.deleteDatabase(DB);
    r.onsuccess = r.onerror = r.onblocked = () => ok();
  });
}

let shared: JournalDB | null | undefined;
/** Process-wide db, or null where IndexedDB is unavailable. */
export function journalDB(): JournalDB | null {
  if (wiped) return null;
  if (shared === undefined)
    shared = typeof indexedDB === "undefined" ? null : idbJournal();
  return shared;
}
