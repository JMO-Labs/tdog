// Minimal dependency-free QR encoder: byte mode, ECC level M, versions 1-10.

// Per version (index 1..10): [ecPerBlock, [blocks1, data1], [blocks2, data2]]
const BLOCKS: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};
const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const dataCodewords = (v: number) => {
  const [, b1, d1, b2, d2] = BLOCKS[v]!;
  return b1 * d1 + b2 * d2;
};

// GF(256) tables, primitive polynomial 0x11D.
const EXP: number[] = [];
const LOG: number[] = new Array<number>(256).fill(0);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
const mul = (a: number, b: number) =>
  a === 0 || b === 0 ? 0 : EXP[(LOG[a]! + LOG[b]!) % 255]!;

/** Reed-Solomon remainder of `data` for `n` EC codewords. */
export function rsRemainder(data: number[], n: number): number[] {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((c, j) => {
      next[j] = next[j]! ^ mul(c, EXP[i]!);
      next[j + 1] = next[j + 1]! ^ c;
    });
    gen = next; // low-order first, monic
  }
  const rem = new Array<number>(n).fill(0);
  for (const d of data) {
    const f = d ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < n; i++) rem[i] = rem[i]! ^ mul(gen[n - 1 - i]!, f);
  }
  return rem;
}

function buildCodewords(bytes: number[], v: number): number[] {
  const cap = dataCodewords(v) * 8;
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; cw.length < cap / 8; pad ^= 0xec ^ 0x11) cw.push(pad);

  const [ec, b1, d1, b2, d2] = BLOCKS[v]!;
  const blocks: { d: number[]; e: number[] }[] = [];
  let pos = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const len = i < b1 ? d1 : d2;
    const d = cw.slice(pos, pos + len);
    pos += len;
    blocks.push({ d, e: rsRemainder(d, ec) });
  }
  const out: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++)
    blocks.forEach((b) => i < b.d.length && out.push(b.d[i]!));
  for (let i = 0; i < ec; i++) blocks.forEach((b) => out.push(b.e[i]!));
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    lines.push(m[i]!.map((b) => (b ? "1" : "0")).join(""));
    lines.push(m.map((r) => (r[i] ? "1" : "0")).join(""));
  }
  for (const l of lines) {
    for (const run of l.match(/0{5,}|1{5,}/g) ?? []) score += run.length - 2;
    for (const p of ["10111010000", "00001011101"])
      for (let i = l.indexOf(p); i >= 0; i = l.indexOf(p, i + 1)) score += 40;
  }
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const c = m[y]![x];
      if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1])
        score += 3;
    }
  const dark = m.flat().filter(Boolean).length;
  score += Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
  return score;
}

export type Qr = { version: number; size: number; modules: boolean[][] };

/** Encode text (UTF-8) as a QR code. Throws if it exceeds version 10. */
export function encodeQr(text: string): Qr {
  const bytes = Array.from(new TextEncoder().encode(text));
  let v = 1;
  while (
    v <= 10 &&
    4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(v) * 8
  )
    v++;
  if (v > 10) throw new Error("qr: text too long");
  const size = 17 + 4 * v;
  const mod: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const fn: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const setFn = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    mod[y]![x] = dark;
    fn[y]![x] = true;
  };

  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
  const al = ALIGN[v]!;
  al.forEach((cy, i) =>
    al.forEach((cx, j) => {
      const last = al.length - 1;
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      )
        return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  const drawFormat = (mask: number) => {
    const data = mask; // ECC M = 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const b = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, b(i));
    setFn(8, 7, b(6));
    setFn(8, 8, b(7));
    setFn(7, 8, b(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, b(i));
    setFn(8, size - 8, true);
  };
  drawFormat(0);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      setFn(a, c, bit);
      setFn(c, a, bit);
    }
  }

  const cw = buildCodewords(bytes, v);
  const bits = cw.flatMap((c) =>
    Array.from({ length: 8 }, (_, i) => ((c >>> (7 - i)) & 1) !== 0),
  );
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y]![x] && k < bits.length) mod[y]![x] = bits[k++]!;
      }
  }

  let best: boolean[][] = mod;
  let bestMask = 0;
  let bestScore = Infinity;
  MASKS.forEach((f, mask) => {
    const m = mod.map((row, y) =>
      row.map((d, x) => (fn[y]![x] ? d : d !== f(x, y))),
    );
    const s = penalty(m);
    if (s < bestScore) [best, bestMask, bestScore] = [m, mask, s];
  });
  mod.forEach((row, y) => row.forEach((_, x) => (mod[y]![x] = best[y]![x]!)));
  drawFormat(bestMask);
  return { version: v, size, modules: mod };
}

/** SVG path data (1 unit per module, no quiet zone) from horizontal runs. */
export function qrPath(qr: Qr): string {
  let d = "";
  qr.modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let e = x;
      while (e < row.length && row[e]) e++;
      d += `M${x} ${y}h${e - x}v1h-${e - x}z`;
      x = e;
    }
  });
  return d;
}
