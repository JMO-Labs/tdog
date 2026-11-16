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
// ends on its own, the session falls back for good to the PTY stream with
// alt-screen detection off.

// pipeCmd is the host command streaming tmux session tdog-<id>'s raw pane
// bytes to stdout. id is a server-generated, idRe-validated session id.
// cat runs as a child (no exec) so the EXIT trap still runs when it ends;
// the trap closes the pane's pipe only while it is still this command's, so a
// stale command exiting late never closes its successor's pipe.
func pipeCmd(id string) string {
	t := tmuxPrefix + id
	script := strings.Join([]string{
		`d=$(mktemp -d) || exit 1`,
		`trap '[ "$(tmux show -qv -t ` + t + ` @tdog_pipe)" = "$d" ] && tmux pipe-pane -t ` + t + `; rm -rf "$d"' EXIT`,
		`trap 'exit 1' HUP INT TERM`,
		`mkfifo -m 600 "$d/p" || exit 1`,
		`tmux set -t ` + t + ` @tdog_pipe "$d" \; pipe-pane -t ` + t + ` \; pipe-pane -O -t ` + t + ` "cat > '$d/p'" || exit 1`,
		`cat "$d/p"`,
	}, "; ")
	return "sh -c " + shQuote(script) // sh: the login shell may not be POSIX
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

// chanPipe closes its ssh channel; the host's cat then dies on its next write
// (or with the pane) and the trap cleans up.
type chanPipe struct {
	io.Reader
	sess *ssh.Session
}

func (p chanPipe) Close() error { return p.sess.Close() }

// pipeLive reports whether transport t is current and running; callers hold s.mu.
func (s *Session) pipeLive(t *session) bool {
	return s.s == t && !s.parked && !s.hungUp && !s.exited && !s.fellBack
}

// startPipe opens t's pane pipe and starts its reader. It is a no-op once the
// session fell back. ponytail: pane bytes flow only once pipe-pane runs, so
// output between attach and that point is missing from the journal (the
// screen still shows it).
func (s *Session) startPipe(t *session) {
	s.mu.Lock()
	ok := s.pipeFeed.Load() && !s.fellBack
	s.mu.Unlock()
	if !ok {
		return
	}
	rc, err := t.openPipe()
	if err != nil {
		s.pipeFallback(t, err)
		return
	}
	s.mu.Lock()
	if !s.pipeLive(t) || s.pipe != nil { // parked, swapped or ended meanwhile
		s.mu.Unlock()
		_ = rc.Close()
		return
	}
	done := make(chan struct{})
	s.pipe, s.pipeDone = rc, done
	s.mu.Unlock()
	go s.readPipe(t, rc, done)
}

// readPipe feeds the journal from rc until it ends. An end nobody asked for
// (closePipe clears s.pipe first) on a live transport triggers the fallback.
func (s *Session) readPipe(t *session, rc io.ReadCloser, done chan struct{}) {
	defer close(done)
	buf := make([]byte, flushSize)
	var err error
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
	if mine {
		s.pipeFallback(t, err)
	}
}

// closePipe closes the live pipe, if any, and waits for its reader to exit.
func (s *Session) closePipe() {
	s.mu.Lock()
	rc, done := s.pipe, s.pipeDone
	s.pipe = nil
	s.mu.Unlock()
	if rc != nil {
		_ = rc.Close()
		<-done
	}
}

// pipeFallback switches a live session's journal to the PTY stream for good,
// logging once. Ends caused by park, kill or exit are not failures.
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
