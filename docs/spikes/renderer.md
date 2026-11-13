# Spike: terminal renderer (ADR-0001)

Harness for comparing xterm.js and restty behind the `TerminalRenderer` adapter.

## Run the bench

```sh
cd web && npm ci && npm run dev
# open http://localhost:5173/bench?renderer=xterm
# open http://localhost:5173/bench?renderer=restty
```

`/bench` exists only in dev builds (`import.meta.env.DEV`); production builds drop it.

- **Run replay** feeds the bundled fixture (`web/src/bench/fixture.ts`: 256/truecolor
  SGR, Nerd Font glyphs, ligature samples, 60 htop-style full-screen redraws) 5× through
  the renderer in 16 KiB chunks, waiting for each write callback (same back-pressure as
  a live session).
- Result line: throughput (MB/s, 1 MB = 10^6 B) plus frame time avg / p95 / max sampled
  with `requestAnimationFrame` during the replay.
- **transparent over animated background**: sets the theme background to
  `rgba(0,0,0,0)` over an animated CSS gradient; the FPS counter (rolling 120 frames)
  runs all the time.
- **restty backend** shows WebGPU, WebGL2 or none, probed in restty's preference order
  (restty's xterm-compat API does not report the backend it picked).

Use a Nerd Font with ligatures (e.g. a Nerd-patched Fira Code) installed locally.
Compare both renderers on the same machine and browser; record numbers below.

## Results

| Renderer | Browser / GPU | Backend | MB/s | frame avg | p95 | FPS (transparent) |
|----------|---------------|---------|------|-----------|-----|-------------------|
| xterm.js |               |         |      |           |     |                   |
| restty   |               |         |      |           |     |                   |

## Feature checklist

Legend: **auto** = covered by CI/unit tests; **human** = needs a person at a real browser.

| Feature | xterm.js | restty | How verified |
|---------|----------|--------|--------------|
| Fixture replays through the renderer, write acks fire | [x] | [x] | auto (`bench/replay.test.ts`, adapter tests) |
| Throughput / frame stats math | [x] | [x] | auto (`bench/stats.test.ts`) |
| Backend detection logic (WebGPU → WebGL2 → none) | n/a | [x] | auto (`bench/backend.test.ts`); actual backend on real GPU: human |
| Ligatures render with GPU renderer on | [ ] | [ ] | human: `/bench`, check `=> !== <=>` line in a ligature font |
| Nerd Font glyphs (powerline, icons) correct width | [ ] | [ ] | human |
| kitty keyboard protocol (`kitten show-key -m kitty`, nvim mappings) | [ ] | [ ] | human, live session |
| kitty graphics (`kitten icat`) | [ ] | [ ] | human, live session |
| sixel (`img2sixel`) | [ ] | [ ] | human, live session |
| IME (CJK input, compose/dead keys) | [ ] | [ ] | human |
| Transparency over animated background keeps ≥ 60 FPS | [ ] | [ ] | human: `/bench` toggle + FPS readout |

Note: `XtermRenderer` does not set xterm's `allowTransparency`, so the transparent
toggle may show an opaque background with xterm.js; record that as observed.
