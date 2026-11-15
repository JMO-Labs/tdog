// Nerd Font glyphs (Symbols Nerd Font Mono). Class names per the Nerd Fonts cheat sheet.
// Font is subset to these codepoints; adding a glyph means re-running pyftsubset (see web/src/assets/fonts/README.md).
export const GLYPHS = {
  brush: "\u{F00E3}", // nf-md-brush
  system: "", // nf-cod-color_mode
  light: "\u{F05A8}", // nf-md-white_balance_sunny
  dark: "\u{F0594}", // nf-md-weather_night
  gear: "", // nf-cod-gear
  power: "\u{F0425}", // nf-md-power
  server: "", // nf-cod-server
  bolt: "", // nf-fa-bolt
  modem: "\u{F0469}", // nf-md-router_wireless
  splitRight: "", // nf-cod-split_horizontal
  splitDown: "", // nf-cod-split_vertical
  layout: "", // nf-cod-layout
  more: "", // nf-cod-ellipsis
  menu: "", // nf-cod-menu
  chevron: "", // nf-cod-chevron_right
  check: "", // nf-cod-check
  signout: "", // nf-cod-sign_out
  briefcase: "", // nf-cod-briefcase
  plus: "", // nf-cod-add
  close: "", // nf-cod-close
  search: "", // nf-cod-search
  copy: "", // nf-cod-copy
  paste: "", // nf-cod-clippy
  eraser: "\u{F01FE}", // nf-md-eraser
  paw: "\u{F03E9}", // nf-md-paw (removed in Task 4)
} as const;
export type IconName = keyof typeof GLYPHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <span className="nf" aria-hidden="true" data-icon={name}>
      {GLYPHS[name]}
    </span>
  );
}
