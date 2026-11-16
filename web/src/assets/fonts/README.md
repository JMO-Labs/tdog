# Symbols Nerd Font Mono (subset)

`SymbolsNerdFontMono-Regular.woff2` holds only the codepoints used in `src/shell/icons.tsx` `GLYPHS`.
Source: `SymbolsNerdFontMono-Regular.ttf` from https://github.com/ryanoasis/nerd-fonts/releases/latest/download/NerdFontsSymbolsOnly.zip

To add a glyph: add it to `GLYPHS`, then regenerate (fonttools is NOT a repo dependency):

```sh
python3 -m venv /tmp/ftvenv && /tmp/ftvenv/bin/pip install fonttools brotli
/tmp/ftvenv/bin/pyftsubset SymbolsNerdFontMono-Regular.ttf \
  --unicodes=U+20,U+EA60,U+EA6D,U+EA6E,U+EA76,U+EA7C,U+EAAC,U+EAB2,U+EAB6,U+EAC0,U+EAC6,U+EAF8,U+EB50,U+EB56,U+EB57,U+EB94,U+EBCC,U+EBEB,U+F0E7,U+F00E3,U+F01FE,U+F03E9,U+F0425,U+F0469,U+F0594,U+F05A8 \
  --flavor=woff2 --output-file=SymbolsNerdFontMono-Regular.woff2
```

## Full set (terminal)

`SymbolsNerdFontMono-Full.woff2` is the whole Nerd Fonts v3.5.1 symbol font, the fallback for terminal text so prompt icons (starship, p10k, powerline) render:

```sh
/tmp/ftvenv/bin/pyftsubset SymbolsNerdFontMono-Regular.ttf --unicodes='*' --glyphs='*' \
  --flavor=woff2 --output-file=SymbolsNerdFontMono-Full.woff2
```
