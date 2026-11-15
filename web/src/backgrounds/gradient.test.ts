import { expect, test } from "vitest";
import { buildGradient, parseGradient } from "./gradient";

test("two stops, angle", () => {
  expect(
    buildGradient({
      angle: 135,
      stops: [
        { color: "#ff00aa", pos: 0 },
        { color: "#000000", pos: 100 },
      ],
    }),
  ).toBe("linear-gradient(135deg, #ff00aa 0%, #000000 100%)");
});

test("clamps stops to 2-4 and sorts by position", () => {
  const s = (c: string, pos: number) => ({ color: c, pos });
  const g = buildGradient({
    angle: 400,
    stops: [
      s("#111", 90),
      s("#222", 10),
      s("#333", 50),
      s("#444", 60),
      s("#555", 70),
    ],
  });
  expect(g).toBe(
    "linear-gradient(40deg, #222 10%, #333 50%, #444 60%, #111 90%)",
  );
  expect(buildGradient({ angle: 0, stops: [s("#111", 0)] })).toMatch(
    /^linear-gradient\(0deg, #111 0%, #[0-9a-f]+ 100%\)$/,
  );
});

test("rejects unsafe colours by falling back to black", () => {
  const g = buildGradient({
    angle: 0,
    stops: [
      { color: "url(x)", pos: 0 },
      { color: "#fff", pos: 100 },
    ],
  });
  expect(g).toBe("linear-gradient(0deg, #000000 0%, #fff 100%)");
});

test("parse round-trips builder output", () => {
  const spec = {
    angle: 200,
    stops: [
      { color: "#123456", pos: 0 },
      { color: "#abcdef", pos: 100 },
    ],
  };
  expect(parseGradient(buildGradient(spec))).toEqual(spec);
  expect(parseGradient("radial-gradient(red, blue)")).toBeNull();
});
