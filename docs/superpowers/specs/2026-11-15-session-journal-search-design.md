# Session journal and full-text search

Status: draft for approval · 2026-11-15

## Why
The owner wants to search the entire output of terminal sessions, jump to the hit, and copy the command, the
output, or both. The same record of "what ran and what it printed" is the foundation for later features
(command blocks, done pings, rewind/tape deck), so it is built once, here.

## Goals
- Search all recorded output across panes and scenes; each hit shows its command, pane and time.
- From a hit: jump to that point in the pane, copy command, copy output, copy both.
- Privacy by default: history lives in the user's browser and only as long as the terminal does.

## Non-goals
- Command-block UI, done pings, rewind/macros (later designs that reuse this journal).
- Cross-device search by default.

## Anti-goals
- History silently kept on the server after the browser has it.
- Search with silent holes: any gap is shown as a gap.
- Typing or terminal output lagging because of recording or search.

## Approaches considered
- **A (chosen):** the server parses the PTY stream into records (command, output, exit code, cwd, start/end
  time) using shell-integration markers; the browser stores records locally and searches them in a background
  worker. The server sees every byte and must buffer while the user is away anyway; later server sync reuses
  the same records.
- B: browser reads xterm's own buffer. Rejected: can't record while away; breaks the hand-over below.
- C: server-side index. Rejected: puts history on the server by default.

## Decisions (owner-approved)
**Storage modes**
- Default — *this browser only*: records live in the browser's local database, survive reloads, and are
  deleted when the terminal is closed or killed. Other devices cannot search them.
- Option — *sync history to server* (off by default): records are also kept on the server so any device,
  including a phone, can search; deleted after a chosen retention of 12, 24 or 36 hours.
- Every mode: per-pane "don't record" toggle and a "forget this pane now" action.

**While no browser is attached**
- Local shells, and SSH panes that are still connected: the server holds new output encrypted, in memory only,
  capped at 16 MB per pane (oldest dropped, gap marked), and hands it to the browser on reconnect, then deletes it.
  Encryption protects against swap/core dumps, not against root on the tdog host (documented).
- SSH panes idle at a prompt with no browser attached for 5 minutes disconnect; the remote tmux keeps the shell.
  A running command keeps the connection up (full capture continues).
- After a disconnect, the pane shows a marked gap: "Output while disconnected isn't in history — Restore from
  host". Only that user action pulls missed lines from the remote tmux scrollback (tdog sets a higher
  history-limit, ~50k lines, on its own tmux sessions). Never automatic.

**Command boundaries**
- tdog enables standard shell-integration markers (prompt / command start / command end with exit code) for
  bash and zsh it launches locally. For SSH hosts the user adds a one-line snippet (shown in Settings); without
  markers, output is still recorded and searchable, just not split per command.

**Search UX**
- Opens from ⌘K ("Search history…") and its own shortcut; results grouped by pane/scene with the matching
  line highlighted, command, time and exit code.
- Actions per hit: Jump to (scrolls that pane to the point, highlights it), Copy command, Copy output,
  Copy both. Plain text and regex.

## Left to the builder
- Record format, wire protocol for records and hand-over, browser storage layout and quotas (evict oldest
  closed-pane data first; warn near quota).
- Search worker design (a streaming scan is expected to suffice; add an index only if measurements demand).
- Encryption details (per-pane in-memory key), marker parsing robustness, alt-screen apps (vim/htop: record
  as a single "full-screen app" span, not searchable frames).
- Exact shortcut (must not collide with existing ones) and how "jump to" maps to scrollback when the line has
  scrolled out of xterm's buffer (fall back to showing the record in an overlay).

## Calls made by the design author (review while reading)
- Markers: OSC 133 (A prompt, B command start, C output start, D;exit end), plus the OSC 7 cwd tdog already
  emits. tdog's built-in bash prompt (internal/term/shell.go) and a zsh precmd/preexec snippet emit them; the
  SSH snippet in Settings is the same lines. Without markers, output is recorded as time-sliced chunks
  (one record per quiet gap of ≥2 s), searchable but without command/exit code.
- Sync storage: no database. Append-only per-pane record files (JSON lines, gzip on rotation) under the data
  dir, each file carrying its expiry; a sweep every 10 minutes deletes expired files. Matches how the plugin
  store already persists JSON. Served to other devices over the same record stream as below.
- Idle/attached tracking lives on the server: "attached" = at least one open WebSocket for the session;
  "idle" = last marker seen is D (shell at prompt) and no output for 5 minutes. A pane without markers never
  auto-disconnects.
- Record flow: the server pushes records over the existing WebSocket as a new frame type (incremental while a
  command runs, finalised on D). The page writes them to IndexedDB. The search worker starts when search opens,
  scans IndexedDB in pages, streams hits back, and stops when search closes. Running commands are searchable.
- Restore from host: a new WebSocket control frame. The server runs `tmux capture-pane -p -J -S -50000` over
  the pane's SSH connection, aligns the result to the last recorded lines, and inserts what is newer as one
  "restored" record. Missing tmux or a scrollback that no longer reaches the gap shows a clear message and
  leaves the gap marked.
- Encryption (owner asked for it): AES-256-GCM with a random per-pane key held only in process memory,
  encrypting each buffered chunk; the key is dropped with the buffer.
