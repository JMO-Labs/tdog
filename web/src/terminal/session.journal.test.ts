import { expect, test, vi } from "vitest";
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
  const recv = (evs: object[]) =>
    sock.onmessage!({
      data: new Uint8Array([
        FrameType.Journal,
        ...new TextEncoder().encode(JSON.stringify(evs)),
      ]).buffer,
    } as MessageEvent);
  const ctl = () =>
    sent.map((f) => JSON.parse(new TextDecoder().decode(f.subarray(1))));
  return { s, recv, ctl };
}
const e = (seq: number) => ({ seq, kind: "start", rec: `r${seq}`, at: "t" });

test("acks the highest seq only after apply resolves", async () => {
  let release!: () => void;
  const db = memJournal();
  const apply = db.apply.bind(db);
  db.apply = (p, v) => new Promise((ok) => (release = () => ok(apply(p, v))));
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
