# Session Journal and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what each terminal ran and printed, keep it in the browser by default, and let the user search everything, jump to a hit, and copy the command and/or output.

**Architecture:** A Go `journal` package turns the PTY byte stream into ordered journal events (command start/output/end, gaps) using OSC 133 markers. Each `Session` keeps unacknowledged events in an AES-GCM–encrypted in-memory buffer (16 MB cap) and streams them to the attached browser as a new frame type; the browser writes them to IndexedDB and acks, which frees the server copy. Search runs in a Web Worker over IndexedDB. Optional server sync writes acked events to expiring per-pane files. SSH panes idle at a prompt with no browser park (close SSH, tmux keeps the shell) and offer "Restore from host".

**Tech Stack:** Go 1.2x stdlib (`crypto/aes`, `crypto/cipher`), coder/websocket, golang.org/x/crypto/ssh; React/TS, IndexedDB (native), Web Worker (Vite `?worker`), Vitest; no new deps, so web tests use an in-memory `JournalDB` implementation instead of a fake IndexedDB.

**Spec:** `docs/superpowers/specs/2026-11-15-session-journal-search-design.md`

## Global Constraints
- Default mode: this browser only; data deleted when the terminal is closed or killed. Sync off by default; retention choices exactly 12, 24, 36 hours.
- Server buffer: encrypted, memory only, 16 MB per pane, oldest dropped with a marked gap; deleted once acked.
- SSH park: no attachment AND shell at prompt (last marker D or A) AND no output for 5 minutes. A running command or a pane without markers never parks.
- Restore from host only on explicit user action; `tmux capture-pane -p -J -S -50000`; tdog raises tmux `history-limit` to 50000 when lower.
- Markers: OSC 133 A/B/C/D(;exit) + existing OSC 7; no markers → time-sliced records (new record after ≥2 s without output).
- Full-screen apps (`CSI ?1049h` … `?1049l`): one record line `[full-screen app]`, no frame content.
- Per-pane "Don't record" and "Forget this pane's history" in every mode.
- Every HTTP route / WS message authenticated (ADR-0003). No new npm or Go deps beyond stdlib + approved list. Files < 500 lines. Never edit `.github/workflows/*`.
- Gate per task: `go vet ./... && go test ./internal/...` (Go tasks), `cd web && npm run typecheck && npm run fmt:check && npx vitest run` exits 0 (web tasks).

## Review Focus
1. Output with markers split across PTY reads (`\x1b]13` | `3;D;0\x07`) → parser still yields one D (Task 1 test).
2. Browser closes mid-command and returns after the 16 MB cap was exceeded → gap record shown, newest data intact, no crash (Task 2 test).
3. Two tabs attached to the same pane in turn → events acked by tab A are not resent to tab B, and B still gets everything after (Task 3 test).
4. Huge single-line output (e.g. `cat` of a minified file, 5 MB no newline) → search stays responsive, hit shows a trimmed snippet (Task 6 test).
5. Pane killed while sync is on → server files for that pane deleted immediately, not at expiry (Task 9 test).

---

### Task 1: OSC 133 journal parser (Go)

**Files:**
- Create: `internal/journal/parser.go`, `internal/journal/parser_test.go`

**Interfaces:**
- Produces:
```go
type Kind uint8 // Start, Output, End, Gap
type Event struct {
    Seq   uint64    `json:"seq"`
    Kind  string    `json:"kind"`  // "start" | "out" | "end" | "gap"
    Rec   uint64    `json:"rec"`   // record id the event belongs to
    Cmd   string    `json:"cmd,omitempty"`  // start
    Cwd   string    `json:"cwd,omitempty"`  // start
    Text  string    `json:"text,omitempty"` // out: ANSI-stripped UTF-8
    Exit  *int      `json:"exit,omitempty"` // end
    Why   string    `json:"why,omitempty"`  // gap reason
    At    time.Time `json:"at"`
}
type Parser struct{ /* state */ }
func NewParser(now func() time.Time) *Parser
func (p *Parser) Feed(b []byte) []Event   // incremental; safe across split sequences
func (p *Parser) AtPrompt() bool          // last marker A or D
func (p *Parser) HasMarkers() bool
```
- [ ] **Step 1: Failing tests** (table-driven in `parser_test.go`):
  - `marked command`: feed `"\x1b]133;A\x07$ \x1b]133;B\x07ls\r\n\x1b]133;C\x07a\r\nb\r\n\x1b]133;D;0\x07"` → events start{cmd:"ls"}, out{text:"a\nb\n"}, end{exit:0}; `AtPrompt()` true.
  - `split marker across reads`: same bytes fed one byte at a time → identical events.
  - `ansi stripped`: `"\x1b[32mok\x1b[0m"` inside C..D → out text `"ok"`.
  - `cwd from osc 7`: `"\x1b]7;file://h/srv/app\x1b\\"` before B → start.cwd `/srv/app`.
  - `full-screen app`: `"\x1b[?1049h...junk...\x1b[?1049l"` inside a command → single out `"[full-screen app]\n"`.
  - `no markers time slicing`: feed "x", advance fake clock 3 s, feed "y" → two records.
- [ ] **Step 2:** `go test ./internal/journal/` — FAIL.
- [ ] **Step 3: Implement** a byte-level state machine (ground / ESC / OSC / CSI) that keeps partial sequences across `Feed` calls; command text = bytes between B and C with ANSI stripped and trimmed; cap a single out event at 64 KB (emit several).
- [ ] **Step 4:** tests PASS; `gofmt -l internal` empty.
- [ ] **Step 5: Commit** `feat(journal): OSC 133 parser`.

### Task 2: Encrypted pending buffer (Go)

**Files:**
- Create: `internal/journal/buffer.go`, `internal/journal/buffer_test.go`

**Interfaces:**
- Produces:
```go
type Buffer struct{ /* aes-gcm key, sealed chunks, size */ }
func NewBuffer(capBytes int) *Buffer            // random 32-byte key via crypto/rand
func (b *Buffer) Add(ev Event)                  // seals JSON; drops oldest over cap, then Adds a gap event once
func (b *Buffer) Since(seq uint64) []Event      // decrypted, seq > given
func (b *Buffer) Ack(seq uint64)                // frees ≤ seq
func (b *Buffer) Wipe()                         // drop all + key
```
- [ ] **Step 1: Failing tests**: round-trip; `Ack` frees; over-cap keeps newest and `Since(0)` starts with `{kind:"gap", why:"buffer full"}`; sealed bytes in memory do not contain the plaintext (`bytes.Contains` false); `Wipe` then `Since` empty.
- [ ] **Step 2:** FAIL. **Step 3:** implement (nonce per chunk, `crypto/rand`). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(journal): encrypted pending buffer`.

### Task 3: Session wiring and journal frames

**Files:**
- Modify: `internal/term/session.go` (`feed` → also parser + buffer; `serve` → send pending journal events after replay, handle ack/mode/forget controls), `internal/term/term.go` (create parser/buffer per session; cap const `journalCap = 16 << 20`)
- Modify: `internal/frame/frame.go` (`Journal Type = 0x04` server→client, JSON array of `journal.Event`; helpers `EncodeJournal([]journal.Event) []byte`)
- Modify: input path that parses client Control frames (`pumpInput` in `internal/term`) to accept `{"type":"jrnl-ack","seq":N}`, `{"type":"jrnl-record","on":bool}`, `{"type":"jrnl-forget"}`
- Test: `internal/term/journal_test.go`

- [ ] **Step 1: Failing tests** (use existing session test harness with a fake PTY): output with markers produces a Journal frame after the Output frame for the same bytes; reconnect after ack N resends only seq > N (Review Focus 3); `jrnl-record off` stops events and wipes buffer; `jrnl-forget` wipes buffer; unauthenticated path unchanged.
- [ ] **Step 2:** FAIL. **Step 3:** implement; journal frames batch every flush (same cadence as output). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(term): stream journal events with ack`.

### Task 4: Shell integration markers

**Files:**
- Modify: `internal/term/shell.go` (`bashRC` adds OSC 133 via `PS0`/`PROMPT_COMMAND`; add `zshRC` with `precmd`/`preexec`, used when target shell is zsh)
- Create: `web/src/settings/historySnippet.ts` exporting `SSH_SNIPPET_BASH`, `SSH_SNIPPET_ZSH` (same lines, for Settings)
- Test: `internal/term/shell_test.go`

- [ ] **Step 1: Failing test**: run bash with `bashRCFile()` in a PTY, send `true\n` then `false\n`, parse output with `journal.Parser` → two records with exit 0 and 1 and cmd `true`/`false`. Skip zsh test when zsh is absent (`exec.LookPath`).
- [ ] **Step 2:** FAIL. **Step 3:** implement (exit code captured as first statement of `PROMPT_COMMAND`). **Step 4:** PASS. **Step 5: Commit** `feat(term): OSC 133 shell integration for bash and zsh`.

### Task 5: Browser journal store

**Files:**
- Create: `web/src/journal/types.ts` (`JournalEvent` mirrors Go `Event`; `JournalRecord {pane, rec, cmd, cwd, exit?, start, end?, out: string, gap?: string}`), `web/src/journal/db.ts` (`JournalDB` interface + `idbJournal()` IndexedDB impl + `memJournal()` for tests), `web/src/journal/ingest.ts`
- Modify: `web/src/protocol/frames.ts` (decode type `0x04` → `{kind:"journal", events}`), `web/src/terminal/session.ts` (on journal frame: `ingest`, then send `jrnl-ack` with max seq; expose `setRecording(on)`, `forget()`), `web/src/shell/useSceneKill.ts` / pane close path (delete pane records on close/kill)
- Test: `web/src/journal/ingest.test.ts`, `web/src/protocol/frames.test.ts`

**Interfaces:**
- Produces: `interface JournalDB { apply(pane: string, evs: JournalEvent[]): Promise<void>; records(pane?: string): AsyncIterable<JournalRecord>; forget(pane: string): Promise<void>; }`; `ingest(db, pane, evs)`; `onJournalStart(cb: (pane, rec) => void)` hook used by Task 7 for xterm markers.
- [ ] **Step 1: Failing tests**: start/out/end events fold into one record; out appends; gap becomes a record with `gap`; ack sent with highest seq after `apply` resolves (not before); forget removes only that pane.
- [ ] **Step 2:** FAIL. **Step 3:** implement (IndexedDB store `records`, key `[pane, rec]`, index `pane`; `out` capped at 2 MB per record keeping head+tail with `…` marker). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(web): browser journal store`.

### Task 6: Search worker

**Files:**
- Create: `web/src/journal/search.ts` (pure `matchRecord(rec, query): Hit[]`), `web/src/journal/search.worker.ts` (scans `idbJournal().records()`, posts hits in batches of 50, cancellable), `web/src/journal/useJournalSearch.ts`
- Test: `web/src/journal/search.test.ts`

**Interfaces:**
- Produces: `type Query = { text: string; regex: boolean; caseSensitive: boolean }`; `type Hit = { pane: string; rec: number; cmd: string; at: number; exit?: number; line: string; lineNo: number; inCmd: boolean }`; `useJournalSearch(q: Query): { hits: Hit[]; done: boolean }`.
- [ ] **Step 1: Failing tests**: plain match in output and in cmd; regex; invalid regex → no throw, zero hits; 5 MB single line → `line` snippet ≤ 200 chars around match (Review Focus 4); results ordered newest first.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** `feat(web): journal search worker`.

### Task 7: Search panel, jump and copy

**Files:**
- Create: `web/src/journal/SearchPanel.tsx` (+ `search.css`, uses `.float`), `web/src/journal/jump.ts`
- Modify: `web/src/TerminalPane.tsx` (register xterm marker on journal start for that pane: `rec → IMarker`), `web/src/shell/useWorkspaceCommands.ts` (command "Search history…", shortcut ⇧⌘F unless taken — check `useKeyboardShortcuts.ts`), `web/src/overlays/pane/init.ts` (overlay "journal-record" showing a full record when its marker is gone)
- Test: `web/src/journal/SearchPanel.test.tsx`

**Interfaces:**
- Produces: `jumpTo(hit: Hit): "scrolled" | "overlay"`; copy helpers `copyCommand(hit)`, `copyOutput(hit)`, `copyBoth(hit)` (both = `$ cmd\n` + output).
- [ ] **Step 1: Failing tests**: typing shows grouped hits (by scene → pane) with cmd, time, exit; Enter jumps; buttons call clipboard with exact strings; hit whose marker was disposed opens the overlay; empty state copy "No matches in this browser's history." plus, when sync is off, "Turn on history sync in Settings to search other devices."
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** `feat(web): search history panel with jump and copy`.

### Task 8: History settings and per-pane controls

**Files:**
- Modify: `web/src/settings/SettingsPanel.tsx` (section "History": mode radio "This browser only" / "Sync to server", retention select 12/24/36 h, SSH snippet with copy buttons), `web/src/settings/prefs.ts` (`historySync: "off" | "12" | "24" | "36"`, default `"off"`), `web/src/terminal/TerminalMenu.tsx` ("Don't record this pane" checkbox, "Forget this pane's history"), `web/src/presets/panes.ts` (`paneRecording(pane)`, `setPaneRecording`)
- Test: `web/src/settings/history.test.tsx`, `web/src/terminal/TerminalMenu.test.tsx`

- [ ] **Step 1: Failing tests**: default mode off; choosing sync sends `PUT /api/journal/settings {retentionHours}`; menu toggles call `session.setRecording(false)` and persist; forget calls `db.forget(pane)` and `session.forget()`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(web): history settings and pane controls`.

### Task 9: Server sync store (optional mode)

**Files:**
- Create: `internal/journal/store.go`, `internal/journal/http.go`, tests
- Modify: `internal/server/server.go` (mount authenticated routes), `internal/term/session.go` (on ack, when sync on, append acked events to store; on kill/close, `store.DeletePane`)

**Interfaces:**
- Produces: `type Store struct{ dir string; ret time.Duration }`; `func (s *Store) Append(pane string, evs []Event) error` (JSON lines `dir/journal/<pane>.jsonl`, header line `{"expires": <unix>}` refreshed on append); `DeletePane(pane)`, `Sweep(now)` every 10 min; routes `GET /api/journal?since=<unix>` (stream JSONL of all panes), `PUT /api/journal/settings {"retentionHours":12|24|36|0}` (0 = off: delete all files).
- [ ] **Step 1: Failing tests**: retention values other than 0/12/24/36 → 400; sweep deletes expired only; DeletePane immediate (Review Focus 5); routes 401 without session cookie.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(journal): optional server sync with expiry`.
- [ ] **Step 6:** web: when sync on, `idbJournal` also pulls `GET /api/journal?since=` on load and `ingest`s panes not present locally (other devices). Test with mocked fetch. Commit `feat(web): pull synced history`.

### Task 10: SSH park and restore from host

**Files:**
- Modify: `internal/term/ssh.go` (`spawnSSHCmd` returns a session whose transport can be closed and re-dialled: add `park func() error` and `unpark func() (*session, error)` to `session`), `internal/term/session.go` (park delay from env `TDOG_PARK_AFTER`, default 5m; idle check every 30 s using `Parser.AtPrompt()`, `HasMarkers()`, last-output time and `att == nil`; on park emit gap `{why:"disconnected"}`; on attach of a parked session: unpark, then continue), `internal/term/tmux.go` (`raiseHistory(run)`: `tmux show -gv history-limit` → if < 50000, `tmux set -g history-limit 50000`; `capture(run, id)`), Control `{"type":"jrnl-restore","rec":<gap rec>}`
- Modify: `web/src/journal/SearchPanel.tsx` + pane gap rendering: gap records with why "disconnected" show "Output while disconnected isn't in history — Restore from host" button → sends `jrnl-restore`
- Test: `internal/term/park_test.go` (fake clock + fake ssh runner), web gap button test

- [ ] **Step 1: Failing tests**: parks only when all three conditions hold for 5 min; running command (last marker B/C) never parks; pane without markers never parks; attach unparks and shell keeps its tmux session; restore emits one `out` event for lines newer than the last recorded line (align on last 3 non-empty lines); capture failure emits gap `{why:"restore failed: <msg>"}`.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(term): park idle SSH panes and restore from host`.

### Task 11: End-to-end verification

- [ ] **Step 1:** Build image, run on a spare port, in Chrome: run 5 commands across 2 panes, search a word, jump, copy cmd/output/both (read clipboard via page), reload — history still there; kill pane — its history gone; close tab during `seq 1 200000`, reopen — search finds `199999`.
- [ ] **Step 2:** Sync on (12 h): open a second browser context → search finds first context's commands. Turn off → files gone.
- [ ] **Step 3:** SSH host (host.docker.internal): idle 5 min (shorten with `TDOG_PARK_AFTER=10s`), see gap, restore.
- [ ] **Step 4:** Fix what fails; full Go + web suites green; commit `fix: journal end-to-end fixes`.
