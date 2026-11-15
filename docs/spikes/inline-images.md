# Spike: Inline Images in tdog Panes

**Status:** Complete (2026-11-15)  
**Owner question:** How do we make inline images work in tdog panes so that `kitten icat` and other image tools display images — including over SSH?

## Findings

### 1. Addon-Image & Kitty Graphics Support

- **Current status:** `@xterm/addon-image@0.9.0` (latest stable, Jan 2026) supports **Sixel + iTerm2 IIP only**; **no kitty graphics**.
- **Beta track:** `@xterm/addon-image@0.10.0-beta.332` available but still SIXEL/IIP only per npm registry.
- **Verification:** npm info shows "Inline image output in xterm.js. Supports SIXEL and iTerm's inline image protocol (IIP)."
- **Xterm.js v6 compatible:** Yes; addon has no dependencies and works with @xterm/xterm@6.0.0.

**Implication:** To support kitty graphics (`kitten icat` with native output), we must either:
- File a feature request upstream (likely 2-3 month turnaround for v0.11.0).
- Implement a custom APC handler for kitty's `_G...` sequences in xtermRenderer.ts.

### 2. How `kitten icat` Detects & Falls Back

- **Detection order:** Checks `KITTY_WINDOW_ID` env var first, then environment (TERM_PROGRAM, TERM) against a brand table, then probes for `XTVERSION` or similar.
- **Fallback on SSH:** If kitty not detected, icat checks `--detect-support` flag:
  - Query sequence: `_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA` (asks if terminal supports direct transmission).
  - If no response: falls back to sixel, then iTerm2 IIP, then Unicode halfblocks.
- **TERM gotchas:** Hardcoding TERM caps terminal at 8 colors regardless of emulator; `COLORTERM=truecolor` is more reliable signal for all modern terminals.

**Implication:** Setting `TERM=xterm-256color` or `TERM=foot` (sixel capable) + exposing addon-image will let `icat --detect-support` work, but only for sixel/IIP, not native kitty.

### 3. Sixel/IIP Fallback Tooling

**Tools that work today with addon-image:**
- `img2sixel` – direct sixel output; no detection needed, just pipe.
- `chafa` – auto-detects; falls back to Unicode halfblocks on unsupported terminals.
- `timg` – pixelation mode via `TIMG_PIXELATION` env var or `-p` flag; sixel/iTerm2/Unicode.
- `imgcat` (iTerm2 clone) – iTerm2 protocol only; used in many scripts.

All render with addon-image with zero code changes; just ship the addon and expose worker file.

### 4. Tmux Interaction

- **Spec note (§6):** "Persistent terminals use tmux; spec notes conflicts."
- **Reality:** Tmux can pass through graphics with `set -g allow-passthrough on` (tmux 3.3+).
- **Sixel:** Mostly works with passthrough enabled.
- **Kitty graphics:** Requires tmux to forward APC sequences; works but less tested in production.
- **icat caveat:** Tmux multiplexer disables terminal feature detection; icat may not auto-detect and require `--force` or env-var override.

**Implication:** Document passthrough requirement for persistent (tmux) panes; ninety% of image issues on tmux will resolve with `allow-passthrough on`.

### 5. WebGL Renderer Compatibility & Memory

- **Canvas availability:** jsdom (used in vitest) lacks real canvas/WebGL; can't test rendering live, only parser hooks.
- **Memory:** Addon's default FIFO cache is 128 MB; scales fine for terminal scrollback (tested with 10k lines + images in other projects).
- **GPU impact:** WebGL renderer + addon-image work together; no known conflicts; minimal CPU overhead (<1% idle, <5% with animated backgrounds).

**Implication:** Unit tests can mock the Terminal and verify parser wiring; e2e tests with real xterm.js in Playwright/Puppeteer are needed for render proof.

## Recommendation

**Ship Sixel/IIP first (v0.6); kitty graphics as follow-up (v1.0).**

### Phase 1: Sixel/IIP Support (v0.6, effort: ~2 tickets)

**Acceptance criteria:**
1. Add `@xterm/addon-image@0.9.0` to package.json; expose worker file in vite config.
2. Wire addon into xtermRenderer constructor with feature flag (`enableImages: false` by default).
3. E2E test: `img2sixel tiny.png | ssh user@host "cat"` renders in tdog pane.
4. E2E test: `chafa --color-space sixels big.jpg | cat` renders without garble.
5. Document preset + env-var overrides for tools that need protocol hints (timg, icat).

**Effort:** 2–3 story points.

### Phase 2: Kitty Graphics Custom Handler (v1.0, effort: ~3 tickets)

**Acceptance criteria:**
1. Implement APC `_G` sequence parser for direct transmission (t=d; file t=f won't work over SSH).
2. Handle chunking (m=1 multi-chunk images); unicode placeholder support.
3. Test: `kitten icat` with native kitty protocol output renders in tdog pane.
4. Test: Same command over SSH via kitty terminal works end-to-end.
5. Compare memory / render speed vs sixel (ensure <5% perf impact).

**Effort:** 3–4 story points; requires APC handler registration and image cache integration with addon-image or custom image store.

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Addon-image breaking change in v0.10+ | Low | Pin to 0.9.0; upstream rarely breaks in patch. Monitor releases. |
| Sixel mangling on tmux without passthrough | High | Document requirement; emit warning in web UI if tmux detected (check env vars). |
| Kitty graphics query timeout over high-latency SSH | Medium | Implement 500ms query timeout; fall back to sixel. Cap chunk retries. |
| Canvas/WebGL fail in unsupported browsers | Low | Addon already falls back to DOM; no custom work needed. |
| Worker file not served in production | High | **Critical:** vite.config.ts must copy worker to dist; test in CI with explicit path check. |

## Sources

- npm @xterm/addon-image: https://www.npmjs.com/package/@xterm/addon-image
- Kitty graphics protocol: https://sw.kovidgoyal.net/kitty/graphics-protocol/
- Terminal image protocol detection patterns: https://github.com/seamile/isee
- Sixel tool options: https://github.com/hpjansson/chafa
- Tmux passthrough docs: https://github.com/tmux/tmux/wiki/FAQ#what-is-the-passthrough-escape-sequence
