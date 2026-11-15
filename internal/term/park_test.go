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

// fakeHost hands out pipe transports that behave like a tmux-backed ssh
// session: park/close end the pipe without killing "tmux", unpark re-dials.
type fakeHost struct {
	mu   sync.Mutex
	run  *fakeRun
	cur  *io.PipeWriter
	err  error // next dial fails with this
	dial int   // successful dials (the attach command ran this many times)
}

func (h *fakeHost) attach() (*session, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.err != nil {
		return nil, h.err
	}
	h.dial++
	pr, pw := io.Pipe()
	h.cur = pw
	w := newWaiter()
	var once sync.Once
	end := func() { once.Do(func() { _ = pw.Close(); w.finish(0) }) }
	s := &session{
		r: pr, w: io.Discard, wait: w, resize: func(uint16, uint16) {},
		kill:  func() { end(); <-w.done },
		close: end,
	}
	s.park = func() error { end(); return nil }
	s.unpark = h.attach
	s.snap = func() (string, error) { return capture(h.run.run, "abc") }
	wrapTmuxKill(s, h.run.run, "abc")
	return s, nil
}

func (h *fakeHost) dials() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.dial
}

// say writes shell output to the current transport (blocks until pumped).
func (h *fakeHost) say(t *testing.T, s string) {
	t.Helper()
	h.mu.Lock()
	pw := h.cur
	h.mu.Unlock()
	if _, err := pw.Write([]byte(s)); err != nil {
		t.Fatal(err)
	}
}

type parkRig struct {
	reg  *Registry
	s    *Session
	h    *fakeHost
	tick chan time.Time
}

func newParkRig(t *testing.T) *parkRig {
	t.Helper()
	reg := NewRegistry(nil, 0)
	tick := make(chan time.Time)
	reg.parkTicker = func() (<-chan time.Time, func()) { return tick, func() {} }
	h := &fakeHost{run: &fakeRun{}}
	tr, _ := h.attach()
	s := reg.addID("abc", "ssh-host", "", tr)
	t.Cleanup(func() {
		s.kill()
		waitFor(t, func() bool { return reg.get("abc") == nil })
	})
	return &parkRig{reg, s, h, tick}
}

func (r *parkRig) parked() bool {
	r.s.mu.Lock()
	defer r.s.mu.Unlock()
	return r.s.parked
}

// idleFor ticks the idle checker at d after now and waits for the check to run.
func (r *parkRig) idleFor(d time.Duration) {
	r.tick <- time.Now().Add(d)
	r.tick <- time.Now().Add(d) // the loop handled the first tick once it takes the second
}

// prompt writes output that leaves the shell idle at a prompt and waits
// until the journal has seen it.
func (r *parkRig) prompt(t *testing.T) {
	t.Helper()
	r.h.say(t, atPrompt)
	waitFor(t, func() bool { return r.s.j.idle(time.Now().Add(time.Hour), parkAfter) })
}

const atPrompt = "\x1b]133;C\x07one\ntwo\nthree\n\x1b]133;D;0\x07\x1b]133;A\x07$ "

func (r *parkRig) events() []journal.Event { return r.s.j.buf.Since(0) }

func TestParkOnlyAfterFullIdleDuration(t *testing.T) {
	r := newParkRig(t)
	r.prompt(t)
	r.idleFor(parkAfter - time.Minute)
	if r.parked() {
		t.Fatal("parked before the idle duration elapsed")
	}
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
	evs := r.events()
	if g := evs[len(evs)-1]; g.Kind != journal.KindGap || g.Why != "disconnected" {
		t.Fatalf("want disconnected gap last, got %+v", g)
	}
	if r.reg.get("abc") == nil {
		t.Fatal("parked session must stay registered")
	}
}

func TestRunningCommandNeverParks(t *testing.T) {
	for _, mark := range []string{"B", "C"} {
		r := newParkRig(t)
		r.h.say(t, "\x1b]133;A\x07$ \x1b]133;"+mark+"\x07")
		r.idleFor(parkAfter * 10)
		if r.parked() {
			t.Fatalf("parked with last marker %s", mark)
		}
	}
}

func TestPaneWithoutMarkersNeverParks(t *testing.T) {
	r := newParkRig(t)
	r.h.say(t, "plain output\n$ ")
	r.idleFor(parkAfter * 10)
	if r.parked() {
		t.Fatal("parked without markers")
	}
}

func TestAttachedPaneNeverParks(t *testing.T) {
	r := newParkRig(t)
	r.prompt(t)
	a, _ := r.s.attach()
	defer r.s.detach(a)
	r.idleFor(parkAfter * 10)
	if r.parked() {
		t.Fatal("parked while a browser is attached")
	}
}

func TestAttachUnparksAndPumpContinues(t *testing.T) {
	r := newParkRig(t)
	r.prompt(t)
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
	a, _, err := r.s.attachUnparked()
	if err != nil || a == nil {
		t.Fatalf("attach: %v", err)
	}
	defer r.s.detach(a)
	if r.parked() || r.h.dials() != 2 {
		t.Fatalf("parked=%v dials=%d", r.parked(), r.h.dials())
	}
	for _, c := range r.h.run.cmds {
		if strings.Contains(c, "kill-session") {
			t.Fatal("unpark must keep the tmux session")
		}
	}
	r.h.say(t, "after\n")
	waitFor(t, func() bool {
		r.s.mu.Lock()
		defer r.s.mu.Unlock()
		return strings.Contains(string(r.s.ring.snapshot()), "after")
	})
}

func TestUnparkFailureKeepsSessionParked(t *testing.T) {
	r := newParkRig(t)
	r.prompt(t)
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
	r.h.mu.Lock()
	r.h.err = errors.New("dial refused")
	r.h.mu.Unlock()
	if a, _, err := r.s.attachUnparked(); err == nil || a != nil {
		t.Fatal("want unpark error and no attachment")
	}
	if !r.parked() || r.reg.get("abc") == nil {
		t.Fatal("failed unpark must leave the session parked and registered")
	}
}

func TestKillWhileParkedRemovesSession(t *testing.T) {
	r := newParkRig(t)
	r.prompt(t)
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
	r.s.kill()
	waitFor(t, func() bool { return r.reg.get("abc") == nil })
	waitFor(t, func() bool { // the kill runs in the background
		r.h.run.mu.Lock()
		defer r.h.run.mu.Unlock()
		return strings.Contains(strings.Join(r.h.run.cmds, "|"), "tmux kill-session -t tdog-abc")
	})
	select {
	case <-r.s.ended:
	case <-time.After(3 * time.Second):
		t.Fatal("pump did not end")
	}
}

// parkedWithCapture parks r and then makes the host's capture return out/err.
func parkedWithCapture(t *testing.T, out string, err error) (*parkRig, uint64) {
	r := newParkRig(t)
	r.prompt(t)
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
	evs := r.events()
	rec := evs[len(evs)-1].Rec
	r.h.run.mu.Lock()
	r.h.run.out, r.h.run.err = out, err
	r.h.run.mu.Unlock()
	return r, rec
}

// restored runs a restore for rec and returns the events it added.
func restored(t *testing.T, r *parkRig, rec uint64) []journal.Event {
	t.Helper()
	before := r.events()
	last := before[len(before)-1].Seq
	r.s.j.control([]byte(`{"type":"jrnl-restore","rec":`+itoa(rec)+`}`), nil)
	var got []journal.Event
	waitFor(t, func() bool { got = r.s.j.buf.Since(last); return len(got) > 0 })
	return got
}

func TestRestoreEmitsLinesAfterAnchor(t *testing.T) {
	scr := "old\none\n$ ls\ntwo\nthree\n$ missed-1\nmissed 2\n\n"
	r, rec := parkedWithCapture(t, scr, nil)
	got := restored(t, r, rec)
	if len(got) != 1 || got[0].Kind != journal.KindOut || got[0].Rec != rec {
		t.Fatalf("want one out for rec %d, got %+v", rec, got)
	}
	if got[0].Text != "$ missed-1\nmissed 2\n" {
		t.Fatalf("text = %q", got[0].Text)
	}
	if r.h.run.cmds[len(r.h.run.cmds)-1] != "tmux capture-pane -p -J -S -50000 -t tdog-abc" {
		t.Fatalf("capture cmd = %q", r.h.run.cmds)
	}
}

func TestRestoreUsesLastAnchorOccurrence(t *testing.T) {
	scr := "one\ntwo\nthree\nstale\none\ntwo\nthree\nfresh\n"
	r, rec := parkedWithCapture(t, scr, nil)
	if got := restored(t, r, rec); got[0].Text != "fresh\n" {
		t.Fatalf("text = %q", got[0].Text)
	}
}

func TestRestoreAnchorMissingGap(t *testing.T) {
	r, rec := parkedWithCapture(t, "unrelated\nlines\n", nil)
	got := restored(t, r, rec)
	g := got[len(got)-1]
	if g.Kind != journal.KindGap || g.Why != "restore failed: scrollback no longer reaches the gap" || g.Rec <= rec {
		t.Fatalf("got %+v", got)
	}
}

func TestRestoreCaptureErrorGap(t *testing.T) {
	r, rec := parkedWithCapture(t, "", errors.New("no server"))
	got := restored(t, r, rec)
	g := got[len(got)-1]
	if g.Kind != journal.KindGap || g.Why != "restore failed: no server" || g.Rec <= rec {
		t.Fatalf("got %+v", got)
	}
}

func TestRaiseHistory(t *testing.T) {
	low := &fakeRun{out: "2000\n"}
	if err := raiseHistory(low.run); err != nil {
		t.Fatal(err)
	}
	if strings.Join(low.cmds, "|") != "tmux show -gv history-limit|tmux set -g history-limit 50000" {
		t.Fatalf("low: %q", low.cmds)
	}
	high := &fakeRun{out: "100000\n"}
	if err := raiseHistory(high.run); err != nil {
		t.Fatal(err)
	}
	if strings.Join(high.cmds, "|") != "tmux show -gv history-limit" {
		t.Fatalf("high: %q", high.cmds)
	}
	if err := raiseHistory((&fakeRun{err: errors.New("x")}).run); err == nil {
		t.Fatal("show error must surface")
	}
}

func TestParkAfterEnv(t *testing.T) {
	get := func(v string) func(string) string { return func(string) string { return v } }
	for in, want := range map[string]time.Duration{"": 5 * time.Minute, "90s": 90 * time.Second, "junk": 5 * time.Minute, "-1m": 5 * time.Minute} {
		if got := parkAfterEnv(get(in)); got != want {
			t.Fatalf("%q: got %v want %v", in, got, want)
		}
	}
}

func TestSpawnTmuxParkUnparkRedials(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	s, err := spawnTmuxCmd(cfg, (&fakeRun{}).run, "abc", "tmux new -A -s tdog-abc")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.park(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-s.wait.done:
	case <-time.After(3 * time.Second):
		t.Fatal("park did not end the transport")
	}
	ns, err := s.unpark()
	if err != nil {
		t.Fatal(err)
	}
	ns.kill()
	n := 0
	for _, c := range d.execLog() {
		if c == "tmux new -A -s tdog-abc" {
			n++
		}
	}
	if n != 2 {
		t.Fatalf("attach ran %d times: %q", n, d.execLog())
	}
}
