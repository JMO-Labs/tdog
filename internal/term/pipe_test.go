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
	want := `exec sh -c 'i=0; until tmux has -t =tdog-abc 2>/dev/null; do i=$((i+1)); [ "$i" -gt 50 ] && exit 1; sleep 0.1; done; ` +
		`d=$(mktemp -d) || exit 1; ` +
		`trap '\''[ -n "$c" ] && kill "$c" 2>/dev/null; tmux if -F -t =tdog-abc: "#{==:#{@tdog_pipe},$d}" "pipe-pane -t =tdog-abc:"; rm -rf "$d"'\'' EXIT; ` +
		`trap '\''exit 1'\'' HUP INT TERM PIPE; ` +
		`mkfifo -m 600 "$d/p" || exit 1; ` +
		`tmux set -t =tdog-abc: @tdog_pipe "$d" \; pipe-pane -t =tdog-abc: \; pipe-pane -O -t =tdog-abc: "cat > '\''$d/p'\''" || exit 1; ` +
		`cat "$d/p" & c=$!; wait "$c"'`
	if got := pipeCmd("abc"); got != want {
		t.Fatalf("got\n%s\nwant\n%s", got, want)
	}
	if strings.Contains(pipeCmd("abc"), "exec cat") {
		t.Fatal("cat must run as a child so the trap still runs")
	}
}

func TestTmuxTargetsExact(t *testing.T) {
	f := &fakeRun{}
	_, _ = capture(f.run, "abc")
	if len(f.cmds) != 1 || f.cmds[0] != "tmux capture-pane -p -J -S -50000 -t '=tdog-abc:'" {
		t.Fatalf("cmds %q", f.cmds)
	}
}

// fakePipe is one opened pane pipe: the test writes w, the session reads r.
// Like an ssh channel, Close does not end a blocked Read: only the transport
// closing (trDone) does, and a stalled pipe never ends.
type fakePipe struct {
	r      *io.PipeReader
	w      *io.PipeWriter
	trDone <-chan struct{}
	stall  bool
	closed chan struct{}
	once   sync.Once
}

func (p *fakePipe) Read(b []byte) (int, error) { return p.r.Read(b) }
func (p *fakePipe) Close() error {
	p.once.Do(func() {
		close(p.closed)
		if !p.stall {
			go func() { <-p.trDone; _ = p.r.Close() }()
		}
	})
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

// pipeHost opens fake pipes; errs fail the opens in order (nil succeeds).
type pipeHost struct {
	mu    sync.Mutex
	errs  []error
	stall bool
	pipes []*fakePipe
	n     int
}

func (ph *pipeHost) open(trDone <-chan struct{}) (io.ReadCloser, error) {
	ph.mu.Lock()
	defer ph.mu.Unlock()
	ph.n++
	if len(ph.errs) > 0 {
		err := ph.errs[0]
		ph.errs = ph.errs[1:]
		if err != nil {
			return nil, err
		}
	}
	pr, pw := io.Pipe()
	p := &fakePipe{r: pr, w: pw, trDone: trDone, stall: ph.stall, closed: make(chan struct{})}
	ph.pipes = append(ph.pipes, p)
	return p, nil
}

func (ph *pipeHost) opens() int {
	ph.mu.Lock()
	defer ph.mu.Unlock()
	return ph.n
}

func (ph *pipeHost) last() *fakePipe {
	ph.mu.Lock()
	defer ph.mu.Unlock()
	return ph.pipes[len(ph.pipes)-1]
}

func newPipeRig(t *testing.T, ph *pipeHost) *parkRig {
	t.Helper()
	r := newRigOn(t, &fakeHost{openPipe: ph.open})
	t.Cleanup(func() { // release stalled readers
		ph.mu.Lock()
		defer ph.mu.Unlock()
		for _, p := range ph.pipes {
			_ = p.r.Close()
		}
	})
	return r
}

// pipeSay writes raw pane bytes to the newest pipe (blocks until read).
func pipeSay(t *testing.T, ph *pipeHost, s string) {
	t.Helper()
	if _, err := ph.last().w.Write([]byte(s)); err != nil {
		t.Fatal(err)
	}
}

// reader waits for a live pipe reader and returns its exit channel.
func reader(t *testing.T, s *Session) chan struct{} {
	t.Helper()
	var done chan struct{}
	waitFor(t, func() bool {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.pipe != nil {
			done = s.pipeDone
		}
		return done != nil
	})
	return done
}

func fellBack(s *Session) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.fellBack
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
	ph := &pipeHost{}
	r := newPipeRig(t, ph)
	reader(t, r.s)
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

func TestPipeOpenRetrySucceeds(t *testing.T) {
	ph := &pipeHost{errs: []error{errors.New("tmux session not there yet")}}
	r := newPipeRig(t, ph)
	reader(t, r.s)
	pipeSay(t, ph, "\x1b]133;C\x07via pipe\n\x1b]133;D;0\x07")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "via pipe") })
	if ph.opens() != 2 || fellBack(r.s) {
		t.Fatalf("opens=%d fellBack=%v, want one retry and no fallback", ph.opens(), fellBack(r.s))
	}
}

func TestPipeOpenFailureFallsBackToPTY(t *testing.T) {
	ph := &pipeHost{errs: []error{errors.New("no mkfifo"), errors.New("no mkfifo")}}
	r := newPipeRig(t, ph)
	waitFor(t, func() bool { return fellBack(r.s) })
	r.h.say(t, "\x1b[?1049h\x1b[Hplain\r\n")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "plain") })
	if got := allOut(r.events()); strings.Contains(got, "full-screen") {
		t.Fatalf("tmux alt screen collapsed the fallback: %q", got)
	}
	if ph.opens() != 2 {
		t.Fatalf("opens=%d, want 2", ph.opens())
	}
}

func TestPipeEarlyEndRetriesThenFallsBack(t *testing.T) {
	ph := &pipeHost{}
	r := newPipeRig(t, ph)
	done := reader(t, r.s)
	pipeSay(t, ph, "\x1b]133;C\x07first\n\x1b]133;D;0\x07")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "first") })
	_ = ph.last().w.Close() // host cat ends
	<-done
	done = reader(t, r.s)
	if ph.opens() != 2 || fellBack(r.s) {
		t.Fatalf("opens=%d fellBack=%v, want one retry", ph.opens(), fellBack(r.s))
	}
	_ = ph.last().w.Close()
	<-done
	waitFor(t, func() bool { return fellBack(r.s) })
	r.h.say(t, "\x1b[?1049hsecond\r\n")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "second") })
	time.Sleep(2 * pipeRetryAfter)
	if ph.opens() != 2 {
		t.Fatalf("opens=%d: a failed retry must not be retried again", ph.opens())
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

func TestPipeEndWithShellExitNoFallback(t *testing.T) {
	ph := &pipeHost{}
	r := newPipeRig(t, ph)
	done := reader(t, r.s)
	_ = ph.last().w.Close() // the pane closes first...
	time.Sleep(pipeRetryAfter / 5)
	r.h.set(func() { r.h.end() }) // ...then the shell's exit arrives
	<-done
	waitFor(t, func() bool { return r.reg.get("abc") == nil })
	time.Sleep(pipeRetryAfter)
	if fellBack(r.s) || ph.opens() != 1 {
		t.Fatalf("fellBack=%v opens=%d: a shell exit is not a pipe failure", fellBack(r.s), ph.opens())
	}
}

// parkViaPipe brings a pipe rig to the parked state.
func parkViaPipe(t *testing.T, r *parkRig, ph *pipeHost) {
	t.Helper()
	pipeSay(t, ph, atPrompt)
	waitFor(t, func() bool { return r.s.j.idle(time.Now().Add(time.Hour), parkAfter) })
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
}

func TestParkClosesPipeUnparkReopens(t *testing.T) {
	ph := &pipeHost{}
	r := newPipeRig(t, ph)
	done := reader(t, r.s)
	first := ph.last()
	parkViaPipe(t, r, ph)
	if !first.isClosed() {
		t.Fatal("park must close the pipe")
	}
	<-done
	a, _, err := r.s.attachUnparked()
	if err != nil || a == nil {
		t.Fatalf("attach: %v", err)
	}
	defer r.s.detach(a)
	reader(t, r.s)
	if ph.opens() != 2 || ph.last() == first {
		t.Fatalf("opens=%d, want a fresh pipe after unpark", ph.opens())
	}
	pipeSay(t, ph, "\x1b]133;C\x07again\n\x1b]133;D;0\x07")
	waitFor(t, func() bool { return strings.Contains(allOut(r.events()), "again") })
	if fellBack(r.s) {
		t.Fatal("a pipe closed by park must not trigger the fallback")
	}
}

func TestParkWithStalledPipeCompletes(t *testing.T) {
	old := pipeWaitMax
	pipeWaitMax = 100 * time.Millisecond
	t.Cleanup(func() { pipeWaitMax = old })
	ph := &pipeHost{stall: true}
	r := newPipeRig(t, ph)
	reader(t, r.s)
	parkViaPipe(t, r, ph) // would hang forever under parkMu without the bound
	if !ph.last().isClosed() {
		t.Fatal("park must close the pipe")
	}
}

func TestKillClosesPipe(t *testing.T) {
	ph := &pipeHost{}
	r := newPipeRig(t, ph)
	done := reader(t, r.s)
	p := ph.last()
	r.s.kill()
	<-done
	waitFor(t, func() bool { return r.reg.get("abc") == nil })
	if !p.isClosed() {
		t.Fatal("kill must close the pipe")
	}
}
