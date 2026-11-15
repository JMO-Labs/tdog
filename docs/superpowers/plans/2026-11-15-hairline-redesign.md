# Hairline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the theme-restyled "sticker" chrome with one calm Hairline chrome system that themes only colour, with flair limited to floating surfaces and the wordmark.

**Architecture:** `index.css` owns a neutral base token set (light/dark) plus fixed shape tokens. `themeStore.apply()` stops writing surface/shape tokens and writes only `--accent`, `--tint` (mixed ≤5% into surfaces via `color-mix`), the four named colours and terminal colours. Workspace chrome CSS (top bar, tabs, panes, status bar) is rewritten to the Hairline layout; a shared `.float` class carries the retro signature for menus, ⌘K, dialogs and toasts. Icons render Nerd Font glyphs through the existing `Icon` API. Dogbert is deleted.

**Tech Stack:** React 19 + TS, Vite, plain CSS, Vitest + Testing Library, playwright-core screenshots for verification.

**Spec:** `docs/superpowers/specs/2026-11-15-hairline-redesign-design.md` (mockup: https://claude.ai/artifact/1g1sqvE2uiFA3JixubmqLT, direction A)

## Global Constraints
- Top bar 36px · pane header 26px · status bar 24px · panes separated by 1px `--line`, no gutters, no pane radius.
- Floating surfaces: `border: 1.5px solid var(--fg)`, `box-shadow: 3px 3px 0 var(--accent)`, radius 8px.
- Wordmark: dog-head mark + "tdog", `text-shadow: 1.5px 1.5px 0 var(--accent)`.
- Surface tint: `color-mix(in srgb, <base> , <tint> N%)`, N ≤ 5, on `--bg`, `--surface`, `--surface-2`.
- Chrome font stack: `"JetBrains Mono", "Symbols Nerd Font Mono", ui-monospace, monospace`; terminal font unchanged.
- Theme fields that no longer affect chrome: border width, radius scale, pattern/motif, display font, shadow style.
- Serious mode: neutral base + plain accent, no flair (no offset shadows, no wordmark shadow, no theme art).
- No new npm dependencies. Files ≤ 500 lines. Never edit `.github/workflows/*`. Semantic commits.
- Every task: `cd web && npm run typecheck && npm run fmt:check && npx vitest run` exits 0.

## Review Focus
1. A theme whose accent is too light/dark for one mode (e.g. yellow on paper) → accent still ≥3:1 against `--surface` in both modes (Task 2 contrast test).
2. Keyboard-only user on a pane → split/⋯/close reachable by Tab and visible on `:focus-within` (Task 5 test).
3. Serious mode toggled live → offset shadows and wordmark shadow vanish, accent becomes plain (Task 7 test).
4. Old persisted prefs (`pet`, `dress`, motif opacity) in localStorage → app loads without errors after pet removal (Task 4 test).
5. Auth/Settings/Studio screens (phase 2) still readable on the new neutral base (Task 9 screenshot check).

---

### Task 1: Neutral base tokens and accent-only theme application

**Files:**
- Modify: `web/src/index.css` (`:root`, dark blocks: neutral values; shape tokens fixed)
- Modify: `web/src/theme/store.ts:97-128` (`apply()`)
- Delete: `web/src/theme/shape.ts` usage in `apply()` (keep file only if other importers remain; else delete with its test)
- Test: `web/src/theme/store.test.ts`

**Interfaces:**
- Produces: CSS vars `--accent`, `--accent-ink`, `--tint`, `--tint-pct`; base `--bg/--surface/--surface-2/--fg/--muted/--line` defined only in `index.css`. `themeAccent(t: Theme): string` exported from `store.ts`.

- [ ] **Step 1: Write failing tests** in `store.test.ts`:
  - `apply sets --accent from the theme and leaves base surfaces to CSS`: after `themeStore.set("memphis-pop")`, `style.getPropertyValue("--accent")` is the theme accent; `--bg`, `--surface`, `--radius-scale`, `--border-width` are `""` on `documentElement.style`.
  - `serious mode accent is the plain theme's accent`.
  - `tint is written as --tint and --tint-pct (max 5)`: theme with `chrome.tint: "#ff0000"` and `tintPct: 9` → `--tint-pct` is `"5%"`.
- [ ] **Step 2: Run** `npx vitest run src/theme/store.test.ts` — FAIL.
- [ ] **Step 3: Implement.** `index.css` neutral base (light: bg `#f4f5f7`, surface `#ffffff`, surface-2 `#eef0f3`, line `#dfe2e7`, fg `#1b1e24`, muted `#6c7280`; dark: bg `#111317`, surface `#171a1f`, surface-2 `#1f232a`, line `#2a2f37`, fg `#e5e7eb`, muted `#8b919c`) and surfaces expressed as `color-mix(in srgb, <base> calc(100% - var(--tint-pct, 0%)), var(--tint, transparent))`. Fixed shape: `--radius-scale: 1; --border-width: 1; --shadow-xs..xl: none`. `apply()` sets only `--accent`, `--accent-ink` (white or `#111` by luminance), `--tint`, `--tint-pct`, the four named colours, `--term-*`; keeps `--pattern` for auth backdrop; drops `shapeVars` and `--header-motif`.
- [ ] **Step 4: Run** the full web suite; fix tests that asserted removed vars only where they encode the old chrome (never weaken unrelated assertions).
- [ ] **Step 5: Commit** `feat(web): neutral base tokens, themes set accent only`.

### Task 2: Accent and tint for every theme

**Files:**
- Modify: `web/src/theme/schema.ts` (ChromeScope gains `accent?: string`, `tint?: string`, `tintPct?: number`; validator accepts hex / 0–5)
- Modify: all `web/src/theme/themes/*.json` (33) — add `chrome.accent` (and `light.chrome.accent` where the light variant needs a darker shade)
- Test: `web/src/theme/accent.test.ts` (new)

**Interfaces:**
- Consumes: `themeAccent(t)` from Task 1 (falls back to `tokens.pink` when `accent` missing).
- Produces: `contrast(a: string, b: string): number` in `web/src/theme/contrast.ts` (WCAG ratio).

- [ ] **Step 1: Failing test** `every theme accent reaches 3:1 on the base surface in both modes`: for each theme, `contrast(accent(dark variant), "#171a1f") >= 3` and `contrast(accent(light variant or base), "#ffffff") >= 3`; and `every theme declares chrome.accent`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `contrast()`; add accents by hand (start from each theme's pink/cursor colour, darken for light where the test fails). Record the table (theme → dark accent → light accent) in the PR body.
- [ ] **Step 4: Run** suite — PASS.
- [ ] **Step 5: Commit** `feat(web): per-theme accent with contrast check`.

### Task 3: Nerd Font glyph icons

**Files:**
- Create: `web/src/assets/fonts/SymbolsNerdFontMono-Regular.woff2` (from nerd-fonts release `NerdFontsSymbolsOnly`, OFL; convert ttf→woff2 with `npx --yes ttf2woff2` once, commit the binary, add the OFL text as `web/src/assets/fonts/OFL-SymbolsNerdFont.txt`)
- Modify: `web/src/index.css` (`@font-face` "Symbols Nerd Font Mono", `--mono` stack per Global Constraints)
- Modify: `web/src/shell/icons.tsx` (replace SVG table with glyph map; same `IconName` keys; `Icon` renders `<span className="nf" aria-hidden="true">{glyph}</span>`)
- Test: `web/src/shell/icons.test.tsx` (new)

**Interfaces:**
- Produces: `GLYPHS: Record<IconName, string>`; `Icon({ name })` unchanged signature. Keys stay: brush, system, light, dark, gear, power, server, bolt, modem, splitRight, splitDown, layout, more, menu, chevron, check, signout, briefcase, close, search, copy, paste, eraser, plus (+ any others present at implementation time; `paw` is removed in Task 4).

- [ ] **Step 1: Failing test**: for every key of `GLYPHS`, `render(<Icon name={k}/>)` yields one `.nf` span, `aria-hidden="true"`, text length 1–2 code units in the Private Use Area (`/[-]|[\u{F0000}-\u{FFFFD}]/u`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** glyph map from the Nerd Fonts cheat-sheet (codicon/fa/md classes; pick one family per meaning, e.g. `nf-cod-split_horizontal` for splitRight). `.nf { font-family: "Symbols Nerd Font Mono"; font-size: 14px; line-height: 1; }`.
- [ ] **Step 4: Run** suite — PASS.
- [ ] **Step 5: Commit** `feat(web): Nerd Font glyph icons for chrome`.

### Task 4: Delete Dogbert

**Files:**
- Delete: `web/src/shell/pet.tsx`, `pet.css`, `petEngine.ts`, `petFrame.ts`, `petLcd.ts`, `petScene.ts`, `petSprites.ts`, `usePetEngine.ts` and their tests
- Modify: `web/src/shell/Workspace.tsx` (remove pet render/prefs), `web/src/shell/useMainMenuGroups.ts` (remove Dogbert item + `petShown/setPetShown`), `web/src/settings/SettingsPanel.tsx` (remove "Status bar pet" and "Dress up Dogbert"), `web/src/settings/prefs.ts` (`PrefName` drops `"pet"`, `"dress"`), `web/src/theme/schema.ts` (remove `costume`), theme JSONs (remove `chrome.costume`), `web/src/copy/copy.ts` (remove `pet.*` keys)
- Test: `web/src/settings/prefs.test.ts`

- [ ] **Step 1: Failing test** `stale pet and dress prefs in storage are ignored`: seed `localStorage` with the old pet/dress keys, render `<Workspace/>` (existing test harness in `shell/Workspace.*.test.tsx`), expect no element with `data-testid="pet"` and no console error.
- [ ] **Step 2: Run** — FAIL (pet still renders).
- [ ] **Step 3: Delete files and references** listed above; `grep -rni "dogbert\|pet\b\|costume" web/src` returns nothing outside unrelated words.
- [ ] **Step 4: Run** suite — PASS.
- [ ] **Step 5: Commit** `feat(web): remove Dogbert pet` (not marked breaking: no public API; old prefs are ignored).

### Task 5: Hairline panes

**Files:**
- Modify: `web/src/layout/SplitView.tsx:180-300` (pane header markup: title, cwd, host chip, `.pane-actions` wrapper)
- Modify: `web/src/layout/layout.css` (hairline grid, 26px header, actions visibility, focus line)
- Test: `web/src/layout/SplitView.test.tsx`

**Interfaces:**
- Consumes: active-pane logic already in SplitView (`current` = last focused else first).
- Produces: `.pane[data-active="true"]` attribute; `.pane-actions` container.

- [ ] **Step 1: Failing tests**:
  - `pane actions stay in the tab order`: the three buttons are focusable (`tabIndex` not -1) in a non-active pane.
  - `only the active pane is marked`: two panes, focus the second → exactly one `[data-active="true"]`, the second.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** CSS: split container `gap: 1px; background: var(--line)`; `.pane { background: var(--surface); border: 0; border-radius: 0 }`; header 26px, title 600 weight `--fg`, cwd `--muted`, host chip `--surface-2`; `.pane-actions { opacity: 0 }` shown on `.pane:hover`, `.pane[data-active="true"]`, `.pane:focus-within`; active header `box-shadow: inset 0 -2px 0 var(--accent)`. Remove pink close button styling (`.danger` in pane header uses `--muted`, red only on hover).
- [ ] **Step 4: Run** suite — PASS.
- [ ] **Step 5: Commit** `feat(web): hairline pane chrome`.

### Task 6: Top bar, tabs and status bar

**Files:**
- Modify: `web/src/shell/Workspace.tsx` (header + footer markup), `web/src/shell/Tabs.tsx` (classes only), `web/src/shell/shell.css`
- Test: `web/src/shell/Tabs.test.tsx`

- [ ] **Step 1: Failing tests**:
  - `active tab is marked with aria-selected and the underline class`: active tab has `aria-selected="true"` and class `on`.
  - `status bar shows host, shell, size and latency as plain items`: footer contains no `.chip` elements; contains text `⌘K`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per Global Constraints: 36px header `background: var(--surface); border-bottom: 1px solid var(--line)`; wordmark (mask mark + "tdog" with accent text-shadow); tabs = text buttons, active `color: var(--fg); font-weight: 600` with `::after` 2px accent underline; unsaved dot `var(--accent)`; status bar 24px plain items with 14px gap, glyph + text, `⌘K` hint right. Remove the 4px motif strip under the header.
- [ ] **Step 4: Run** suite — PASS.
- [ ] **Step 5: Commit** `feat(web): hairline top bar, tabs and status bar`.

### Task 7: Floating-surface signature

**Files:**
- Modify: `web/src/components/menu/menu.css`, `web/src/overlays/overlays.css` (palette, toast, dialogs), `web/src/components/ui/ui.css` (dialog card)
- Create: shared rule `.float` in `web/src/index.css`
- Test: `web/src/components/menu/ActionMenu.keys.test.tsx`, `web/src/overlays/palette.test.tsx`

- [ ] **Step 1: Failing tests**: ActionMenu root, CommandPalette card, toast and dialog card each have class `float`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `.float` per Global Constraints; `[data-serious] .float { box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); border-color: var(--line) }`; apply the class to those four roots; delete their old sticker shadows/borders.
- [ ] **Step 4: Run** suite — PASS.
- [ ] **Step 5: Commit** `feat(web): retro signature on floating surfaces`.

### Task 8: Theme art becomes a scene opt-in

**Files:**
- Modify: `web/src/settings/prefs.ts` (`MOTIF_DEFAULT = 0`), `web/src/TerminalPane.tsx` (effects + motif only when the scene opts in), `web/src/shell/Tabs.tsx` (tab menu item "Theme art in this scene", checked), `web/src/presets/panes.ts` (`sceneArt(scene): boolean`, `setSceneArt(scene, on)` in localStorage `tdog.sceneArt`)
- Test: `web/src/TerminalPane.motif.test.tsx`, `web/src/presets/panes.test.ts`

**Interfaces:**
- Produces: `sceneArt(scene: string): boolean`, `setSceneArt(scene: string, on: boolean): void`; `SceneArtContext` (boolean) provided by `SceneView`.

- [ ] **Step 1: Failing tests**: `no motif or effects by default`; `scene opt-in shows motif and theme effects in every pane of that scene`; `sceneArt persists`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; theme art = terminal motif + all theme `terminal.effects`. Serious mode still forces off.
- [ ] **Step 4: Run** suite — PASS.
- [ ] **Step 5: Commit** `feat(web): theme art is a per-scene opt-in`.

### Task 9: Chrome verification and fixes

**Files:**
- Modify: whatever CSS the screenshots show broken (no new scripts in the repo; screenshots use playwright-core outside it).

- [ ] **Step 1:** Build image `docker build -t tdog:hairline .`, run on a spare port, take screenshots (light + dark) of: workspace with 4-pane split, right-click menu, ⌘K, a toast, kill dialog, sign-in, Settings, Studio — for themes memphis-pop, colonial-marine, ninety-five, pocket-monochrome, plain (serious), dial-up-paranoia.
- [ ] **Step 2:** Fix any unreadable text, clipped controls, leftover sticker shadows or pink close buttons. Phase-2 screens only need to be readable, not redesigned.
- [ ] **Step 3: Run** full suite + `npm run typecheck && npm run fmt:check`.
- [ ] **Step 4: Commit** `fix(web): hairline polish from screenshot review`.
