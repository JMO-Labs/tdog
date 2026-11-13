# tdog — Design Spec (v1)

Status: draft for approval · Date: 2026-11-13 · License: MIT · Repo: github.com/JMO-LABS/tdog (not yet created)

## 1. Vision

Self-hosted, web-based terminal workspace for headless machines. Must feel like sitting at the
workstation (speed, fonts, keys), with unlimited layout + visual customization, presets for single
terminals and whole "scenes", and a fun 90s-MTV-style shell chrome.

Non-goals v1: browser/port-forward panes (future), mobile (v2), multi-user, floating windows,
telemetry, i18n, auto-updater, community theme registry.

## 2. Users & Deployment

- Single user per instance.
- Distributed as Docker image `ghcr.io/jmo-labs/tdog`. Portable; no host install required.
- Primary deployment (author): container on workstation host, reached through Styx Portal
  (k8s) as optional app. Also must run fully standalone.
- Config, presets, themes, fonts, downloaded assets: volume `/data` (e.g. `~/.config/tdog`).

## 3. Architecture

```
Browser (React + dockview, renderer adapter, PWA)
   │  HTTPS (Styx/Traefik or direct)  ·  WS per pane (binary)  ·  REST (config/presets/assets)
Go server (single binary in container)
   ├─ auth provider: styx | standalone
   ├─ session manager: PTY lifecycle, scrollback ring buffer, flow control
   ├─ targets: ssh-host | container | nsenter (opt-in)
   ├─ config store: TOML files + JSON Schema validation
   └─ asset store: fonts, backgrounds, sounds, Giphy cache
```

- Backend: Go. PTY via `creack/pty`; SSH via `golang.org/x/crypto/ssh`.
- Frontend: React + TypeScript + Vite; layout via dockview (+ custom snap-layout layer).
- Renderer: behind `TerminalRenderer` adapter (write, resize, onInput, setTheme, dispose).
  Default xterm.js 6.x (WebGL); restty evaluated in spike (ADR-0001).

## 4. Terminal Experience ("feels local")

Wire protocol: one WebSocket per pane, binary frames, 1-byte type prefix
(`0x00` output, `0x01` input, `0x02` resize, `0x03` control/JSON). No JSON/base64 on hot path.
`TCP_NODELAY`, permessage-deflate off.

Latency techniques:
1. Predictive local echo (dim/underlined) when RTT > ~30 ms; reconcile on server echo; disabled in
   alt-screen/raw mode. User toggle.
2. Flow control: client acks via `write(data, cb)`; server pauses PTY read above high watermark,
   resumes below low watermark. Ctrl-C stays responsive under `cat hugefile`.
3. Server output coalescing: 1–4 ms or 16 KB per frame; client flushes per animation frame.
4. Synchronized output (DEC 2026) frames never split by framing.

Feature parity target (kitty / Terminator), v1:
- Truecolor, ligatures (GPU if spike proves it; else per-terminal toggle), Nerd Fonts.
- Kitty keyboard protocol, kitty graphics (tested subset), sixel.
- OSC 8 hyperlinks, OSC 52 clipboard, OSC 133 prompt marks (jump prev/next prompt).
- Search, URL hints/quick-select, large scrollback, copy mode.
- Broadcast input to group/scene (Terminator), terminal groups.
- Screen-reader mode (xterm.js a11y).

Keys: browser steals Ctrl+W/T/N/Tab. Mitigations: installable PWA, Keyboard Lock API in
fullscreen, tdog prefix key (default `Ctrl+Space`, configurable). All tdog bindings remappable.

## 5. Layout: Scenes & Grid

- **Scene tab** = one workspace; unlimited scene tabs, unlimited terminals per scene.
- Layout model: **split tree** (tiled only, no floating). Drag dividers to resize.
- **Snap layouts** (Win11-style): hover pane handle → template picker (2-up, 3-col, 1+2, 2×2, …)
  which generates split tree.
- **Drag & drop**: drag pane onto another → drop zones left/right/top/bottom/swap; drag to other
  scene tab to move.
- **Kill controls**: "kill scene" and global "kill all shells"; hold-to-confirm with MTV countdown;
  SIGHUP → 3 s → SIGKILL.

## 6. Shell Targets (ADR-0002)

| Target | How | Default | Notes |
|---|---|---|---|
| `ssh-host` | SSH to `host.docker.internal:22`, mounted key | Yes | Real zsh, $PATH, dotfiles; needs host sshd |
| `container` | PTY inside tdog container | Yes | Sandboxed |
| `nsenter` | `--pid=host --privileged`, `nsenter -t 1 -a` | No | Opt-in, root-equivalent, loud docs warning |

Persistence:
- Default: server holds sessions + raw scrollback ring buffer, replayed on reattach. Survives
  browser close, not container restart.
- Per-preset `persistent = true`: terminal wrapped in host `tmux` (ssh-host target) and survives
  tdog restarts. Caveat: tmux may interfere with kitty graphics/some escapes.

## 7. Presets & Config

Format: TOML in `/data`, validated by published JSON Schema (drives builder search + import
validation). Inheritance: **global → scene preset → terminal preset → pane override**; builder
shows origin of each value.

Terminal preset:
```toml
name = "app-dev"
target = "ssh-host"          # ssh-host | container | nsenter
cwd = "~/code/app"
env = { NODE_ENV = "development" }
persistent = false
pre_exec  = { mode = "stop_on_fail", run = ["cd ~/code/app", "source .venv/bin/activate"] }
command   = "npm run dev"     # typed into live shell; Ctrl-C returns to prompt
post_exec = { mode = "all", run = ["notify-send done"] }  # after command finishes
on_close  = { mode = "all", run = ["docker compose down"] } # when terminal closes
theme = "mtv-neon"
font = { family = "JetBrainsMono Nerd Font", size = 14, ligatures = true }
background = { kind = "shader", ref = "vhs-grain", opacity = 0.85, blur = 4 }
```
Hooks: string shorthand or `{ mode = "all" | "stop_on_fail", run = [...] }`.

Scene preset: layout tree, per-pane terminal preset refs + overrides, scene background,
`autostart = true|false` (launch on server start).

## 8. Visual Customization

- **Backgrounds** (terminal + scene layers): image, GIF, video (webm/mp4), CSS gradient, GLSL
  shader (sandboxed WebGL). Per-terminal opacity + blur. Pause when tab hidden; global
  "performance mode" disables all.
- **Giphy**: user-supplied API key; search in background picker; selected assets downloaded to
  `/data` (offline-safe). Paste any image/video URL. Tenor if still available.
- **Fonts**: served from box → 1:1 on every client. Order: server fonts → client fonts → bundled
  Nerd symbols. Font browser: Nerd Fonts (GitHub releases, one-click), Google Fonts,
  drag-drop `.ttf/.otf` upload. No dafont integration (license/scraping); manual upload instead.
- **Shell chrome theme**: 90s-MTV-style default (Memphis patterns, VHS grain, neon, squiggles —
  era aesthetic, no MTV marks/assets), animated boot screen, optional sound packs (off by
  default). Fully swappable.

## 9. Builder

- Visual GUI with live preview + raw TOML editor, two-way synced.
- Settings search (VS Code-style), fully keyboard-navigable.
- Fun and easy: starter gallery, randomize, previews on hover.
- Theme import from URL/file. Themes are **data-only**: colors, fonts, backgrounds, GLSL, sounds.
  No JS, no raw CSS (allowlisted properties only). Validated against schema.

Shipped starters: 28 color schemes (20 ports e.g. Dracula/Catppuccin/Gruvbox + 8 originals),
30+ backgrounds (texture, pattern, gradient, shader, animated, MTV-style), 5+ scene presets,
3 sound packs. All assets original or properly licensed.

## 10. Security & Auth (ADR-0003)

Remote shell = root-level target. Providers:

- **styx**: verify Styx-signed token (shared secret or JWKS) on every HTTP request **and** WS
  upgrade. Safe even if port reached directly.
- **standalone**: single user, Argon2id password; TOTP 2FA + 10 recovery codes (strongly
  suggested — persistent warning banner when off-localhost without TOTP; not mandatory);
  optional passkeys (WebAuthn); first-run one-time setup token printed to container logs;
  cookie HttpOnly/Secure/SameSite=Strict, 12 h idle timeout; progressive lockout;
  "log out all sessions"; audit log (logins, session start/kill).

Also: WS Origin check, CSRF protection on REST, no unauthenticated endpoint except login/health.

## 11. Ops & Repo

- GitHub Actions: lint (golangci-lint, eslint), test, Trivy scan, semantic-release, image →
  GHCR on `v*` tags. Conventional Commits + commitlint. SemVer.
- Docs: Zensical (match Styx), ADRs in `docs/decisions/`.
- No telemetry. Updates = pull new image. English only.

## 12. Roadmap

| Ver | Scope |
|---|---|
| v0.1 | Renderer spike (xterm.js vs restty), Go PTY + ssh/container targets, single terminal, standalone auth |
| v0.2 | Split tree, DnD, snap layouts, scene tabs, kill controls |
| v0.3 | Presets, TOML + schema, hooks, scene autostart |
| v0.4 | Builder UI, backgrounds, transparency, font browser |
| v0.5 | MTV chrome theme, sounds, starter packs |
| v0.6 | Local echo, flow control, kitty gfx/kbd, broadcast, search, URL hints (pull earlier if spike shows lag) |
| v1.0 | Styx auth provider, Giphy, theme import, PWA + keyboard lock, docs |
| v2 | Mobile; later: browser/port-forward panes, multi-host via Styx workstations |

## 13. Open Risks

- Ligatures + WebGL in xterm.js unproven → spike.
- Kitty graphics in xterm.js addon-image is alpha → test exact subset.
- restty maturity → spike decides.
- tmux persistence vs kitty graphics conflicts.
- Shader backgrounds + transparency FPS cost with many panes → measure in spike.
