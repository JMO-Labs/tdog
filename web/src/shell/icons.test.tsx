import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GLYPHS, Icon, type IconName } from "./icons";

const PUA = /^(?:[-]|[\u{F0000}-\u{FFFFD}])$/u;

describe("Icon", () => {
  for (const k of Object.keys(GLYPHS) as IconName[]) {
    it(`${k} renders one aria-hidden PUA glyph span`, () => {
      const { container } = render(<Icon name={k} />);
      const spans = container.querySelectorAll("span.nf");
      expect(spans).toHaveLength(1);
      const s = spans[0]!;
      expect(s.getAttribute("aria-hidden")).toBe("true");
      expect(s.getAttribute("data-icon")).toBe(k);
      expect(s.textContent).toMatch(PUA);
    });
  }
});
