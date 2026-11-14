import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { Mascot } from "./Mascot";

test("arm layer sits behind body layer", () => {
  const { container } = render(<Mascot pose="nono" />);
  const imgs = [...container.querySelectorAll("img")];
  expect(imgs.map((i) => i.className)).toEqual(["m-arm", "m-body"]);
});
