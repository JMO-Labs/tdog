# Hairline redesign (workspace chrome)

Status: draft for approval · 2026-11-15 · Mockups: https://claude.ai/artifact/1g1sqvE2uiFA3JixubmqLT (direction A)

## Why
The owner is not happy with the polish. Today every theme restyles the whole chrome (borders, hard shadows,
corners, patterns, display fonts), each pane carries its own background wash and an always-on hot-pink close
button, and the result reads as four competing frames instead of one tool. tdog should be taken seriously by
people who live in terminals, while keeping its own identity.

## Goals
- Calm, dense, keyboard-first chrome that a tmux/Ghostty user trusts at first sight.
- Identity concentrated in a few deliberate places (see Flair), not spread over every surface.
- One designed chrome system; themes only colour it.

## Non-goals (this pass)
- Sign-in, Settings, Studio screens (phase 2, same system).
- New features (journal, search, blocks are separate designs).

## Anti-goals
- Any theme able to make the chrome look broken or unreadable.
- Decoration on panes, tabs or status bar (borders, shadows, patterns) beyond what encodes state.

## Approaches considered
A Hairline (chosen) · B Tiles (rounded panes on a tray) · C Rail (scenes in a left sidebar) · D Dock (single
bottom bar). A wins: maximum terminal space, the layout terminal power users already trust; the accent and
floating surfaces carry identity. B/C/D cost space or move muscle memory.

## Decisions (owner-approved)
**Layout**
- Top bar 36px: wordmark, scene tabs, then right-aligned main menu and kill-all. Tabs are text with a 2px accent
  underline on the active tab; unsaved dot; `+` new scene.
- Panes edge to edge, separated by 1px `--line` hairlines (no gutters, no radius).
- Pane header 26px, same surface as the pane: title (bold), cwd, host chip. Split / ⋯ / close appear only on
  hover or when the pane is focused. No always-visible close button.
- Focused pane: 2px accent line along the bottom of its header. Nothing else changes.
- Status bar 24px: host, shell, size, latency, ⌘K hint; plain text and Nerd glyphs, no boxed chips.
- Density: compact (numbers above).

**Colour**
- Neutral base tokens, cool-biased: light paper/white, dark graphite. Values from the mockup are the starting point.
- A theme supplies: `accent`, an optional surface tint (≤5% mix into base surfaces), and the terminal palette.
  Light/dark variants keep working as today.
- Theme chrome fields that stop affecting the chrome: border width, radius scale, chrome pattern/motif,
  display font, shadow style. Pattern/motif art moves to an opt-in scene background (below).
- Per-pane background art (vignettes, motifs) is off by default; available only as a scene-level opt-in so
  every pane in a scene matches.
- Serious mode: neutral base + a plain accent; no flair (as today).

**Type**
- Chrome uses JetBrainsMono Nerd Font (already the planned default); icons are Nerd glyphs, replacing the
  current SVG icon set where a glyph exists. Terminal font choice is unchanged (per theme, readable set).

**Flair (the only places)**
- Floating surfaces — right-click/pane/tab/main menus, ⌘K, dialogs, toasts — get a 1.5px ink border and a
  3px hard offset shadow in the accent.
- Wordmark: dog-head mark + "tdog" with a 1.5px accent offset text shadow.
- Kept as-is but restyled to the system: slang toast headlines, themed pane intros, boot intros.
- Dogbert (status-bar pet) is deleted entirely: component, sprites, engine, settings toggle, menu item, tests.

## Left to the builder
- Exact token values and the CSS architecture (replace per-theme chrome CSS with the base system).
- Mapping each existing theme's colours to `accent` + tint; pick sensible accents where a theme has several.
- Bundling the Nerd Font (OFL) for chrome; glyph choices per icon.
- Hover/focus timings; reduced-motion handling.
- Verifying in Chrome across light/dark and at least 6 themes before merge.

## Calls made by the design author (review while reading)
- Floating-surface shadow: CSS `box-shadow: 3px 3px 0 var(--accent)`, fully opaque, plus `1.5px solid var(--fg)` border.
- Accent mapping: one `accent` per theme, chosen by hand in a reviewed table (the theme's current primary
  highlight, usually its pink/cursor colour); other named colours stay available to the terminal palette only.
- Status bar: borders removed, items are plain text + glyph separated by 14px; ⌘K hint always visible.
- Icons: all chrome icons become Nerd glyphs; the SVG set is removed except the dog-head mark in the wordmark.
- Pane actions: all three (split, ⋯, close) show on hover and on the active pane (last focused, else first);
  they stay in the tab order and become visible on `:focus-within` for keyboard users.
- Surface tint: one theme `tint` colour mixed with `color-mix(in srgb, base, tint N%)`, N ≤ 5, applied to
  `--bg`, `--surface` and `--surface-2` alike.
