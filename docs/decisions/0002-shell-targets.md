# ADR-0002: Shell targets from inside Docker

Status: proposed · 2026-11-13

## Context
tdog ships as a portable Docker image, but user needs real host binaries, zsh and dotfiles.
A container PTY only sees the container.

## Decision
Targets selectable per terminal preset:
- `ssh-host` (default): SSH to `host.docker.internal:22` with mounted key. Unprivileged,
  portable (Linux/macOS), real host environment. Requires host sshd.
- `container`: PTY in container, sandboxed.
- `nsenter` (opt-in): `--pid=host --privileged` + `nsenter -t 1 -a`. Root-equivalent; Linux only;
  documented with strong warning.

Persistence: in-memory sessions + scrollback replay by default; per-preset `persistent = true`
wraps the terminal in host tmux to survive container restarts.

## Consequences
SSH adds a hop (negligible on localhost). tmux mode may conflict with kitty graphics.
