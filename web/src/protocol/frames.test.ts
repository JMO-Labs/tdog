import { describe, expect, test } from "vitest";
import {
  decodeFrame,
  encodeAck,
  encodeInput,
  encodeJournalAck,
  encodeJournalForget,
  encodeJournalRecord,
  encodePing,
  encodeResize,
  FrameType,
} from "./frames";

describe("frame codec", () => {
  test("encodes input with type prefix", () => {
    const f = encodeInput(new Uint8Array([97, 98]));
    expect([...f]).toEqual([FrameType.Input, 97, 98]);
  });

  test("encodes resize as big-endian cols/rows", () => {
    const f = encodeResize(120, 40);
    expect([...f]).toEqual([FrameType.Resize, 0, 120, 0, 40]);
  });

  test("encodes ack as JSON control frame", () => {
    const f = encodeAck(1234);
    expect(f[0]).toBe(FrameType.Control);
    expect(JSON.parse(new TextDecoder().decode(f.subarray(1)))).toEqual({
      type: "ack",
      bytes: 1234,
    });
  });

  test("decodes output", () => {
    const d = decodeFrame(new Uint8Array([FrameType.Output, 1, 2]).buffer);
    expect(d).toEqual({ kind: "output", data: new Uint8Array([1, 2]) });
  });

  test("decodes exit control frame", () => {
    const body = new TextEncoder().encode('{"type":"exit","code":3}');
    const buf = new Uint8Array([FrameType.Control, ...body]).buffer;
    expect(decodeFrame(buf)).toEqual({ kind: "exit", code: 3 });
  });

  test("unknown control and unknown types decode to unknown", () => {
    const body = new TextEncoder().encode('{"type":"x"}');
    expect(
      decodeFrame(new Uint8Array([FrameType.Control, ...body]).buffer).kind,
    ).toBe("unknown");
    expect(decodeFrame(new Uint8Array([9]).buffer).kind).toBe("unknown");
    expect(decodeFrame(new ArrayBuffer(0)).kind).toBe("unknown");
  });

  test("malformed control JSON is unknown", () => {
    const buf = new Uint8Array([FrameType.Control, 123]).buffer;
    expect(decodeFrame(buf).kind).toBe("unknown");
  });
});

describe("ping/pong", () => {
  test("encodes ping as JSON control frame", () => {
    const f = encodePing(12.5);
    expect(f[0]).toBe(FrameType.Control);
    expect(JSON.parse(new TextDecoder().decode(f.subarray(1)))).toEqual({
      type: "ping",
      t: 12.5,
    });
  });

  test("decodes pong echoing t", () => {
    const body = new TextEncoder().encode('{"type":"pong","t":12.5}');
    const buf = new Uint8Array([FrameType.Control, ...body]).buffer;
    expect(decodeFrame(buf)).toEqual({ kind: "pong", t: 12.5 });
  });

  test("pong without numeric t is unknown", () => {
    const body = new TextEncoder().encode('{"type":"pong"}');
    const buf = new Uint8Array([FrameType.Control, ...body]).buffer;
    expect(decodeFrame(buf).kind).toBe("unknown");
  });
});

test("decodes the killed control frame", () => {
  const p = new TextEncoder().encode(JSON.stringify({ type: "killed" }));
  const b = new Uint8Array([FrameType.Control, ...p]);
  expect(decodeFrame(b.buffer)).toEqual({ kind: "killed" });
});

describe("journal frames", () => {
  const ctl = (f: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(f.subarray(1)));
  test("decodes 0x04 as a journal event array", () => {
    const body = new TextEncoder().encode(
      '[{"seq":1,"kind":"start","rec":"r"}]',
    );
    const d = decodeFrame(new Uint8Array([FrameType.Journal, ...body]).buffer);
    expect(d).toEqual({
      kind: "journal",
      events: [{ seq: 1, kind: "start", rec: "r" }],
    });
  });
  test("malformed or non-array journal is unknown", () => {
    const bad = (s: string) =>
      decodeFrame(
        new Uint8Array([FrameType.Journal, ...new TextEncoder().encode(s)])
          .buffer,
      ).kind;
    expect(bad("{")).toBe("unknown");
    expect(bad("{}")).toBe("unknown");
  });
  test("encodes jrnl controls", () => {
    expect(ctl(encodeJournalAck(7))).toEqual({ type: "jrnl-ack", seq: 7 });
    expect(ctl(encodeJournalRecord(true))).toEqual({
      type: "jrnl-record",
      on: true,
    });
    expect(ctl(encodeJournalForget())).toEqual({ type: "jrnl-forget" });
  });
});

test("decodes the replayed control frame", () => {
  const p = new TextEncoder().encode(JSON.stringify({ type: "replayed" }));
  const b = new Uint8Array([FrameType.Control, ...p]);
  expect(decodeFrame(b.buffer)).toEqual({ kind: "replayed" });
});

test("decodes session epoch and error control frames", () => {
  const c = (m: object) =>
    new Uint8Array([
      FrameType.Control,
      ...new TextEncoder().encode(JSON.stringify(m)),
    ]).buffer;
  expect(
    decodeFrame(
      c({ type: "session", id: "a", epoch: "e1", target: "ssh-host" }),
    ),
  ).toEqual({
    kind: "session",
    id: "a",
    epoch: "e1",
    target: "ssh-host",
  });
  expect(decodeFrame(c({ type: "session", id: "a" }))).toEqual({
    kind: "session",
    id: "a",
    epoch: undefined,
    target: undefined,
  });
  expect(decodeFrame(c({ type: "error", message: "boom" }))).toEqual({
    kind: "error",
    message: "boom",
  });
});
