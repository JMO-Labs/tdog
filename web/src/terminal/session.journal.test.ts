import { expect, test, vi } from "vitest";
import { setPaneRecording } from "../presets/panes";
import { memJournal, type JournalDB } from "../journal/db";
import { FrameType } from "../protocol/frames";
import { TerminalSession, type SocketLike } from "./session";
import type { TerminalRenderer } from "./renderer";

function setup(db: JournalDB) {
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
    journal: { pane: "p", db },
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

test("setRecording and forget send controls", () => {
  const { s, ctl } = setup(memJournal());
  s.setRecording(false);
  s.forget();
  expect(ctl()).toEqual([
    { type: "jrnl-record", on: false },
    { type: "jrnl-forget" },
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

test("reconnect re-sends jrnl-record off for an opted-out pane", () => {
  const { s, sock, ctl } = setup(memJournal());
  expect(ctl()).toEqual([]); // recording on: nothing to say
  setPaneRecording("p", false);
  s.connect();
  sock.onopen!(new Event("open"));
  sock.onmessage!({
    data: new Uint8Array([
      FrameType.Control,
      ...new TextEncoder().encode(JSON.stringify({ type: "session", id: "B" })),
    ]).buffer,
  } as MessageEvent);
  expect(ctl()).toEqual([{ type: "jrnl-record", on: false }]);
  localStorage.clear();
});
