# ADR-0001: Terminal renderer

Status: proposed · 2026-11-13

## Context
"Feels local" depends mostly on renderer: font shaping, ligatures, Nerd Fonts, input edge cases
(IME, emoji width, wrapped selection), kitty keyboard/graphics, sixel, transparency over
animated backgrounds.

Candidates (late 2026): xterm.js 6.x (mature; VS Code, Zellij, ttyd; kitty kbd merged Jan 2026;
kitty gfx alpha; ligatures+WebGL unproven), restty (libghostty-vt + WebGPU; early release),
ghostty-web (no releases), wterm (experimental DOM renderer).

## Decision
- Renderer behind `TerminalRenderer` adapter.
- 2-day spike, same harness for xterm.js and restty: zsh + Nerd Font, nvim, htop, ligatures,
  kitty kbd, kitty gfx subset, keystroke latency, FPS over shader background with transparency.
- Ship winner as default; tie → xterm.js. Loser may remain experimental per-terminal option.
- If xterm.js wins but ligatures fail with WebGL: per-terminal toggle (GPU vs ligatures).

## Consequences
Small adapter cost; swap stays cheap as restty/ghostty-web mature.
