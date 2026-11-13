# ADR-0004: Layout model

Status: proposed · 2026-11-13

## Context
User wants an unlimited grid, easy resize, drag & drop, Win11-style quick layouts, many terminals
across scene tabs. No floating windows.

## Decision
- Tiled split tree (tmux/Terminator model), unlimited nesting, draggable dividers.
- Snap-layout templates (2-up, 3-col, 1+2, 2×2, …) generate split trees.
- DnD drop zones: left/right/top/bottom/swap; drag across scene tabs.
- Implement on dockview (React) with floating disabled; custom snap-template layer.

## Consequences
dockview covers docking/DnD/tabs; snap picker and scene-preset (de)serialization are ours.
