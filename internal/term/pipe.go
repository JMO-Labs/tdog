package term

import (
	"io"
	"log"
	"strings"
	"time"

	"github.com/JMO-Labs/tdog/internal/journal"
	"golang.org/x/crypto/ssh"
)

// Pane pipe: tmux re-renders the pane for the attached client (alt screen on
// attach, no OSC 133), so the PTY stream is useless to the journal. A second
// ssh channel runs pipeCmd, whose stdout is the pane's raw bytes via
// "tmux pipe-pane"; that stream alone feeds the journal. If it cannot open or
// ends on its own (one retry), the session falls back for good to the PTY
// stream with alt-screen detection off.

var (
	pipeRetryAfter = 500 * time.Millisecond // delay before the single retry
	pipeWaitMax    = 2 * time.Second        // max wait for a closed pipe's reader
)

// pipeCmd is the host command streaming tmux session tdog-<id>'s raw pane
// bytes to stdout. id is a server-generated, idRe-validated session id.
//   - It first waits (about 5 s) for a just-spawned session to exist.
//   - cat runs in the background under wait, so a signal runs the traps at once
//     (sh defers traps while a foreground child runs); the EXIT trap kills cat.
//   - The trap closes the pane's pipe only while it is still this command's (one
//     atomic tmux if), so a stale command exiting late never closes its successor's.
//   - "=" targets match tdog-<id> exactly, never by prefix.
func pipeCmd(id string) string {
	ss, ps := "="+tmuxPrefix+id, "="+tmuxPrefix+id+":"
	script := strings.Join([]string{
		`i=0`,
		`until tmux has -t ` + ss + ` 2>/dev/null; do i=$((i+1))`,
		`[ "$i" -gt 50 ] && exit 1`,
		`sleep 0.1`,
		`done`,
		`d=$(mktemp -d) || exit 1`,
		`trap '[ -n "$c" ] && kill "$c" 2>/dev/null; tmux if -F -t ` + ps + ` "#{==:#{@tdog_pipe},$d}" "pipe-pane -t ` + ps + `"; rm -rf "$d"' EXIT`,
		`trap 'exit 1' HUP INT TERM PIPE`,
		`mkfifo -m 600 "$d/p" || exit 1`,
		`tmux set -t ` + ps + ` @tdog_pipe "$d" \; pipe-pane -t ` + ps + ` \; pipe-pane -O -t ` + ps + ` "cat > '$d/p'" || exit 1`,
		`cat "$d/p" & c=$!`,
		`wait "$c"`,
	}, "; ")
	// exec: a signal from Close must reach this sh, not a login shell parent.
	return "exec sh -c " + shQuote(script) // sh: the login shell may not be POSIX
}

// sshPipe opens the pane pipe for id as a new channel on client.
func sshPipe(client *ssh.Client, id string) func() (io.ReadCloser, error) {
	return func() (io.ReadCloser, error) {
		sess, err := client.NewSession()
		if err != nil {
			return nil, err
		}
		out, err := sess.StdoutPipe()
		if err == nil {
			err = sess.Start(pipeCmd(id))
		}
		if err != nil {
			_ = sess.Close()
			return nil, err
		}
		return chanPipe{out, sess}, nil
	}
}

// chanPipe is the pipe's ssh channel. OpenSSH does not signal a non-pty
// command when its channel closes, so Close sends TERM first (the host trap
// then cleans up at once). Close does not wait for the peer: a blocked Read
// ends only when it answers or the client closes.
type chanPipe struct {
	io.Reader
	sess *ssh.Session
}

func (p chanPipe) Close() error {
	_ = p.sess.Signal(ssh.SIGTERM)
	return p.sess.Close()
}

// pipeLive reports whether transport t is current and running; callers hold s.mu.
func (s *Session) pipeLive(t *session) bool {
	return s.s == t && !s.parked && !s.hungUp && !s.exited && !s.fellBack
}

// runPipe feeds the journal from t's pane pipe until it is closed on purpose
// or t stops being live. A failed open or an unasked end is retried once
// after pipeRetryAfter, then the session falls back. An end that comes with
// the shell's exit is neither. Runs in its own goroutine, so spawn and unpark
// never wait on the host. ponytail: pane bytes flow only once pipe-pane
// runs, so output between attach and that point is missing from the journal
// (the screen still shows it; the PTY never feeds a pipe session's journal).
func (s *Session) runPipe(t *session) {
	for try := 0; ; try++ {
		err := s.pipeOnce(t)
		if err == nil || !s.settle(t) {
			return
		}
		if try == 1 {
			s.pipeFallback(t, err)
			return
		}
	}
}

// settle waits pipeRetryAfter (less if the shell ends) and reports whether t
// is still live.
func (s *Session) settle(t *session) bool {
	select {
	case <-t.wait.done:
		return false
	case <-s.ended:
		return false
	case <-time.After(pipeRetryAfter):
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pipeLive(t)
}

// pipeOnce opens one pipe on t and feeds the journal from it until it ends.
// It returns nil when the pipe was not wanted or closed on purpose (dropPipe
// clears s.pipe first), else why it ended.
func (s *Session) pipeOnce(t *session) error {
	s.mu.Lock()
	ok := s.pipeFeed.Load() && s.pipeLive(t)
	s.mu.Unlock()
	if !ok {
		return nil
	}
	rc, err := t.openPipe()
	if err != nil {
		return err
	}
	s.mu.Lock()
	if !s.pipeLive(t) || s.pipe != nil { // parked, swapped or ended meanwhile
		s.mu.Unlock()
		_ = rc.Close()
		return nil
	}
	done := make(chan struct{})
	s.pipe, s.pipeDone = rc, done
	s.mu.Unlock()
	defer close(done)
	buf := make([]byte, flushSize)
	for err == nil {
		var n int
		n, err = rc.Read(buf)
		if n > 0 {
			s.j.feed(append([]byte(nil), buf[:n]...))
		}
	}
	_ = rc.Close()
	s.mu.Lock()
	mine := s.pipe == rc
	if mine {
		s.pipe = nil
	}
	s.mu.Unlock()
	if !mine {
		return nil
	}
	return err
}

// dropPipe closes the live pipe, if any, without waiting. The returned func
// waits for its reader, at most pipeWaitMax: call it after closing the
// transport, which ends a Read a stalled peer never answers.
func (s *Session) dropPipe() (wait func()) {
	s.mu.Lock()
	rc, done := s.pipe, s.pipeDone
	s.pipe = nil
	s.mu.Unlock()
	if rc == nil {
		return func() {}
	}
	_ = rc.Close()
	return func() {
		select {
		case <-done:
		case <-time.After(pipeWaitMax):
			log.Printf("term: %s: pane pipe reader still blocked after %v; moving on", s.id, pipeWaitMax)
		}
	}
}

// pipeFallback switches a live session's journal to the PTY stream for good,
// logging once.
func (s *Session) pipeFallback(t *session, err error) {
	s.mu.Lock()
	live := s.pipeLive(t)
	if live {
		s.fellBack = true
	}
	s.mu.Unlock()
	if !live {
		return
	}
	log.Printf("term: %s: pane pipe unavailable, journaling the terminal stream: %v", s.id, err)
	s.j.plain()
	s.pipeFeed.Store(false) // after the parser swap: PTY bytes go to the new parser
}

// plain replaces the parser with one that ignores the alternate screen (tmux
// switches to it on attach), continuing seq/rec numbering.
func (j *jrnl) plain() {
	if j == nil {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.on {
		j.add(j.p.Flush(time.Now()))
	}
	j.opts = []journal.Option{journal.WithoutAltScreen()}
	j.base, j.recBase, j.p = j.max, j.recMax, journal.NewParser(time.Now, j.opts...)
}
