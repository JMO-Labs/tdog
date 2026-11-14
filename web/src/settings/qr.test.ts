import { expect, test } from "vitest";
import { encodeQr, qrPath, rsRemainder } from "./qr";

const URI = "otpauth://totp/x";

test("picks the smallest version that fits", () => {
  expect(encodeQr(URI).version).toBe(2);
  expect(encodeQr(URI).size).toBe(25);
  expect(encodeQr("hi").version).toBe(1);
  const long =
    "otpauth://totp/tdog:me?secret=" + "A".repeat(32) + "&issuer=tdog";
  const q = encodeQr(long);
  expect(q.size).toBe(17 + 4 * q.version);
  expect(q.version).toBeGreaterThan(2);
});

test("has finder patterns, timing and dark module", () => {
  const { modules: m, size } = encodeQr(URI);
  for (const [ox, oy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]) {
    for (let i = 0; i < 7; i++) {
      expect(m[oy!]![ox! + i]).toBe(true);
      expect(m[oy! + 6]![ox! + i]).toBe(true);
      expect(m[oy! + i]![ox!]).toBe(true);
      expect(m[oy! + i]![ox! + 6]).toBe(true);
    }
    expect(m[oy! + 3]![ox! + 3]).toBe(true);
    expect(m[oy! + 1]![ox! + 1]).toBe(false);
  }
  for (let i = 8; i < size - 8; i++) expect(m[6]![i]).toBe(i % 2 === 0);
  expect(m[size - 8]![8]).toBe(true);
});

test("version 7+ codes carry version info and still scale", () => {
  const q = encodeQr("x".repeat(150));
  expect(q.version).toBe(8);
  expect(q.modules.length).toBe(q.size);
});

test("Reed-Solomon matches the known 'HELLO' style vector", () => {
  // ISO 18004 example: 16 data codewords, 10 EC codewords (version 1-M).
  const data = [
    32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17,
  ];
  expect(rsRemainder(data, 10)).toEqual([
    196, 35, 39, 119, 235, 215, 231, 226, 93, 23,
  ]);
});

test("rejects text beyond version 10 and emits a path", () => {
  expect(() => encodeQr("x".repeat(300))).toThrow();
  expect(qrPath(encodeQr("hi"))).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
});
