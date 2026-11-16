package term

import (
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/journal"
)

func TestPipeCmdExact(t *testing.T) {
	want := `sh -c 'd=$(mktemp -d) || exit 1; ` +
		`trap '\''[ "$(tmux show -qv -t tdog-abc @tdog_pipe)" = "$d" ] && tmux pipe-pane -t tdog-abc; rm -rf "$d"'\'' EXIT; ` +
		`trap '\''exit 1'\'' HUP INT TERM; ` +
		`mkfifo -m 600 "$d/p" || exit 1; ` +
		`tmux set -t tdog-abc @tdog_pipe "$d" \; pipe-pane -t tdog-abc \; pipe-pane -O -t tdog-abc "cat > '\''$d/p'\''" || exit 1; ` +
		`cat "$d/p"'`
	if got := pipeCmd("abc"); got != want {
		t.Fatalf("got\n%s\nwant\n%s", got, want)
	}
	if strings.Contains(pipeCmd("abc"), "exec ") {
		t.Fatal("cat must run as a child so the trap still runs")
	}
}

// fakePipe is one opened pane pipe: the test writes w, the session reads r.
type fakePipe struct {
	r      *io.PipeReader
	w      *io.PipeWriter
	closed chan struct{}
	once   sync.Once
}

func (p *fakePipe) Read(b []byte) (int, error) { return p.r.Read(b) }
func (p *fakePipe) Close() error {
	p.once.Do(func() { close(p.closed); _ = p.r.Close() })
	return nil
}

func (p *fakePipe) isClosed() bool {
	select {
	case <-p.closed:
		return true
	default:
		return false
	}
}

// pipeHost counts pipe opens and fails them with err when set.
type pipeHost struct {
	mu    sync.Mutex
	err   error
	pipes []*fakePipe
}

func (ph *pipeHost) open() (io.ReadCloser, error) {
	ph.mu.Lock()
	defer ph.mu.Unlock()
	if ph.err != nil {
		ph.pipes = append(ph.pipes, nil)
		return nil, ph.err
	}
	pr, pw := io.Pipe()
	p := &fakePipe{r: pr, w: pw, closed: make(chan struct{})}
	ph.pipes = append(ph.pipes, p)
	return p, nil
}

func (ph *pipeHost) opens() int {
	ph.mu.Lock()
	defer ph.mu.Unlock()
	return len(ph.pipes)
}

func (ph *pipeHost) last() *fakePipe {
	ph.mu.Lock()
	defer ph.mu.Unlock()
	return ph.pipes[len(ph.pipes)-1]
}

func newPipeRig(t *testing.T, err error) (*parkRig, *pipeHost) {
	t.Helper()
	ph := &pipeHost{err: err}
	return newRigOn(t, &fakeHost{openPipe: ph.open}), ph
}

// pipeSay writes raw pane bytes to the live pipe (blocks until read).
func pipeSay(t *testing.T, ph *pipeHost, s string) {
	t.Helper()
	if _, err := ph.last().w.Write([]byte(s)); err != nil {
		t.Fatal(err)
	}
}

// readerDone is the live pipe reader's exit channel (nil when none).
func readerDone(s *Session) chan struct{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pipeDone
}

func allOut(evs []journal.Event) string {
	var b strings.Builder
	for _, e := range evs {
		if e.Kind == journal.KindOut {
			b.WriteString(e.Text)
		}
	}
	return b.String()
}

func TestPipeFeedsJournalNotPTY(t *testing.T) {
	r, ph := newPipeRig(t, nil)
	if ph.opens() != 1 {
		t.Fatalf("opens=%d, want 1 at spawn", ph.opens())
	}
	r.h.say(t, "\x1b[?1049h\x1b]133;C\x07pty-only\n\x1b]133;D;0\x07")
	waitFor(t, func() bool {
		r.s.mu.Lock()
		defer r.s.mu.Unlock()
		return strings.Contains(string(r.s.ring.snapshot()), "pty-only")
	})
	pipeSay(t, ph, "echo hello\r\n\x1b[?2004l\r\x1b]133;C\x07hello\r\n\x1b]133;D;0\x07\x1b]133;A\x07$ ")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "hello") })
	if got := allOut(r.events()); strings.Contains(got, "pty-only") || strings.Contains(got, "full-screen") {
		t.Fatalf("PTY bytes reached the parser: %q", got)
	}
}

func TestPipeOpenFailureFallsBackToPTY(t *testing.T) {
	r, ph := newPipeRig(t, errors.New("no mkfifo"))
	r.h.say(t, "\x1b[?1049h\x1b[Hplain\r\n")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "plain") })
	if got := allOut(r.events()); strings.Contains(got, "full-screen") {
		t.Fatalf("tmux alt screen collapsed the fallback: %q", got)
	}
	if ph.opens() != 1 {
		t.Fatalf("opens=%d, want 1", ph.opens())
	}
}

func TestPipeEarlyEndFallsBackOnce(t *testing.T) {
	r, ph := newPipeRig(t, nil)
	pipeSay(t, ph, "\x1b]133;C\x07first\n\x1b]133;D;0\x07")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "first") })
	done := readerDone(r.s)
	_ = ph.last().w.Close() // host cat ends
	<-done
	r.h.say(t, "\x1b[?1049hsecond\r\n")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "second") })
	if ph.opens() != 1 {
		t.Fatalf("opens=%d: an ended pipe must not be retried", ph.opens())
	}
	var last, lastRec uint64
	for _, e := range r.events() {
		if e.Seq <= last {
			t.Fatalf("seq not monotonic: %d after %d", e.Seq, last)
		}
		last = e.Seq
		if e.Kind == journal.KindStart {
			if e.Rec <= lastRec {
				t.Fatalf("rec reused: %d after %d", e.Rec, lastRec)
			}
			lastRec = e.Rec
		}
	}
}

func TestParkClosesPipeUnparkReopens(t *testing.T) {
	r, ph := newPipeRig(t, nil)
	first := ph.last()
	done := readerDone(r.s)
	pipeSay(t, ph, atPrompt)
	waitFor(t, func() bool { return r.s.j.idle(time.Now().Add(time.Hour), parkAfter) })
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
	if !first.isClosed() {
		t.Fatal("park must close the pipe")
	}
	<-done
	a, _, err := r.s.attachUnparked()
	if err != nil || a == nil {
		t.Fatalf("attach: %v", err)
	}
	defer r.s.detach(a)
	if ph.opens() != 2 || ph.last() == first {
		t.Fatalf("opens=%d, want a fresh pipe after unpark", ph.opens())
	}
	pipeSay(t, ph, "\x1b]133;C\x07again\n\x1b]133;D;0\x07")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "again") })
	if !r.s.pipeFeed.Load() {
		t.Fatal("a pipe closed by park must not trigger the fallback")
	}
}

func TestKillClosesPipe(t *testing.T) {
	r, ph := newPipeRig(t, nil)
	p, done := ph.last(), readerDone(r.s)
	r.s.kill()
	<-done
	waitFor(t, func() bool { return r.reg.get("abc") == nil })
	if !p.isClosed() {
		t.Fatal("kill must close the pipe")
	}
}
