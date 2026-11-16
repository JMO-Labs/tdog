import { afterEach, expect, test, vi } from "vitest";
import { setPaneRecording } from "../presets/recording";
import { memJournal, type JournalDB } from "../journal/db";
import { onJournalError } from "../journal/ingest";
import { FrameType } from "../protocol/frames";
import { TerminalSession, type SocketLike } from "./session";
import type { TerminalRenderer } from "./renderer";

function setup(db: JournalDB | null, pane = "p") {
  const sent: Uint8Array[] = [];
  const sock = {
    binaryType: "",
    onopen: null,
    onmessage: null,
    onclose: null,
    send: (d: Uint8Array) => void sent.push(d),
    close() {},
  } as unknown as SocketLike;
  const r = {
    onInput() {},
    onResize() {},
    write: vi.fn(),
    size: () => ({ cols: 80, rows: 24 }),
    dispose() {},
  } as unknown as TerminalRenderer;
  const s = new TerminalSession(r, () => sock, vi.fn(), {
    paneId: pane,
    journal: db ? { pane, db } : undefined,
  });
  s.connect();
  sock.onopen!(new Event("open"));
  sent.length = 0;
  const sess = (id = "A") =>
    sock.onmessage!({
      data: new Uint8Array([
        FrameType.Control,
        ...new TextEncoder().encode(JSON.stringify({ type: "session", id })),
      ]).buffer,
    } as MessageEvent);
  sess();
  sent.length = 0; // the record-state line every session frame sends
  const reconnect = (id = "B") => {
    s.connect();
    sock.onopen!(new Event("open"));
    sent.length = 0;
    sess(id);
  };
  const ctrl = (m: object) =>
    sock.onmessage!({
      data: new Uint8Array([
        FrameType.Control,
        ...new TextEncoder().encode(JSON.stringify(m)),
      ]).buffer,
    } as MessageEvent);
  const recv = (evs: object[]) =>
    sock.onmessage!({
      data: new Uint8Array([
        FrameType.Journal,
        ...new TextEncoder().encode(JSON.stringify(evs)),
      ]).buffer,
    } as MessageEvent);
  const ctl = () =>
    sent
      .filter((f) => f[0] === FrameType.Control)
      .map((f) => JSON.parse(new TextDecoder().decode(f.subarray(1))));
  return {
    s,
    reconnect,
    ctrl,
    recv,
    ctl: () => ctl().filter((m) => m.type.startsWith("jrnl")),
    sock,
  };
}
const e = (seq: number) => ({ seq, kind: "start", rec: seq, at: "t" });

test("acks the highest seq only after apply resolves", async () => {
  let release!: () => void;
  const db = memJournal();
  const apply = db.apply.bind(db);
  db.apply = (p, s, v) =>
    new Promise((ok) => (release = () => ok(apply(p, s, v))));
  const { recv, ctl } = setup(db);
  recv([e(1), e(3), e(2)]);
  await Promise.resolve();
  expect(ctl()).toEqual([]);
  release();
  await vi.waitFor(() => expect(ctl()).toEqual([{ type: "jrnl-ack", seq: 3 }]));
});

test("no ack when apply rejects; warns once", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const db = memJournal();
  db.apply = () => Promise.reject(new Error("quota"));
  const { recv, ctl } = setup(db);
  recv([e(1)]);
  recv([e(2)]);
  await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 0));
  expect(ctl()).toEqual([]);
  expect(warn).toHaveBeenCalledTimes(1);
});

test("setRecording, forget and restore send controls", () => {
  const { s, ctl } = setup(memJournal());
  s.setRecording(false);
  s.forget();
  s.restore(7);
  expect(ctl()).toEqual([
    { type: "jrnl-record", on: false },
    { type: "jrnl-forget" },
    { type: "jrnl-restore", rec: 7 },
  ]);
});

test("after a failed apply, later batches are not applied or acked until reconnect", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const db = memJournal();
  const apply = db.apply.bind(db);
  const fn = vi.fn(apply).mockRejectedValueOnce(new Error("quota"));
  db.apply = fn;
  const { recv, ctl, s, sock } = setup(db);
  recv([e(1)]);
  await new Promise((r) => setTimeout(r, 0));
  recv([e(2)]);
  await new Promise((r) => setTimeout(r, 0));
  expect(ctl()).toEqual([]);
  expect(fn).toHaveBeenCalledTimes(1);
  s.connect();
  sock.onopen!(new Event("open"));
  sock.onmessage!({
    data: new Uint8Array([
      FrameType.Control,
      ...new TextEncoder().encode('{"type":"session","id":"A"}'),
    ]).buffer,
  } as MessageEvent);
  recv([e(1), e(2)]);
  await vi.waitFor(() =>
    expect(ctl().at(-1)).toEqual({ type: "jrnl-ack", seq: 2 }),
  );
});

test("frames after dispose are dropped", async () => {
  const db = memJournal();
  const spy = vi.spyOn(db, "apply");
  const { recv, s } = setup(db);
  s.dispose();
  recv([e(1)]);
  await new Promise((r) => setTimeout(r, 0));
  expect(spy).not.toHaveBeenCalled();
});

afterEach(() => localStorage.clear());

test("every session frame sends the record state, even without a journal db", () => {
  setPaneRecording("p", false);
  const { reconnect, ctl } = setup(null);
  reconnect();
  expect(ctl()).toEqual([{ type: "jrnl-record", on: false }]);
  setPaneRecording("p", true);
  reconnect();
  expect(ctl()).toEqual([{ type: "jrnl-record", on: true }]);
});

test("a frame between forget and jrnl-forgotten is dropped and not acked", async () => {
  const db = memJournal();
  const apply = vi.spyOn(db, "apply");
  const { s, recv, ctrl, ctl } = setup(db);
  s.forget();
  recv([e(1)]);
  await new Promise((r) => setTimeout(r, 0));
  expect(apply).not.toHaveBeenCalled();
  expect(ctl()).toEqual([{ type: "jrnl-forget" }]);
  ctrl({ type: "jrnl-forgotten" });
  recv([e(2)]);
  await vi.waitFor(() =>
    expect(ctl()).toEqual([
      { type: "jrnl-forget" },
      { type: "jrnl-ack", seq: 2 },
    ]),
  );
});

test("forget while disconnected is sent after the record state on reconnect", async () => {
  const db = memJournal();
  const apply = vi.spyOn(db, "apply");
  const { s, sock, recv, ctl, ctrl } = setup(db);
  s.connect(); // socket not open yet
  s.forget();
  sock.onopen!(new Event("open"));
  ctrl({ type: "session", id: "B" });
  expect(ctl()).toEqual([
    { type: "jrnl-record", on: true },
    { type: "jrnl-forget" },
  ]);
  recv([e(1)]);
  await new Promise((r) => setTimeout(r, 0));
  expect(apply).not.toHaveBeenCalled();
  ctrl({ type: "jrnl-forgotten" });
  recv([e(2)]);
  await vi.waitFor(() => expect(apply).toHaveBeenCalled());
});

test("a new epoch for the same session id restarts seq and keeps records distinct", async () => {
  const db = memJournal();
  const { ctrl, recv, ctl: all } = setup(db);
  const ctl = () => all().filter((m) => m.type === "jrnl-ack");
  ctrl({ type: "session", id: "A", epoch: "e1" });
  recv([e(1), e(2)]);
  await vi.waitFor(() => expect(ctl()).toEqual([{ type: "jrnl-ack", seq: 2 }]));
  ctrl({ type: "session", id: "A", epoch: "e2" });
  recv([e(1)]);
  await vi.waitFor(() =>
    expect(ctl().at(-1)).toEqual({ type: "jrnl-ack", seq: 1 }),
  );
  const sids = [];
  for await (const r of db.records("p")) sids.push(r.sid);
  expect(sids.filter((s) => s === "A.e2")).toHaveLength(1);
  expect(sids).toContain("A.e1");
});

test("without an epoch the sid is the id alone", async () => {
  const db = memJournal();
  const { recv, ctl } = setup(db);
  recv([e(1)]);
  await vi.waitFor(() => expect(ctl()).toEqual([{ type: "jrnl-ack", seq: 1 }]));
  for await (const r of db.records("p")) expect(r.sid).toBe("A");
});

test("journal frames are dropped, not applied or acked, while not recording", async () => {
  const db = memJournal();
  const apply = vi.spyOn(db, "apply");
  const { recv, ctl } = setup(db);
  setPaneRecording("p", false);
  recv([e(1)]);
  await new Promise((r) => setTimeout(r, 0));
  expect(apply).not.toHaveBeenCalled();
  expect(ctl()).toEqual([]);
});

test("an error control frame reaches the gap banner subscribers", () => {
  const got: [string, string][] = [];
  const off = onJournalError((p, m) => got.push([p, m]));
  const { ctrl } = setup(memJournal());
  ctrl({ type: "error", message: "recording is off" });
  off();
  expect(got).toEqual([["p", "recording is off"]]);
});
