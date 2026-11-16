package term

import (
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/journal"
	"golang.org/x/crypto/ssh"
)

// fakeHost hands out pipe transports that behave like a tmux-backed ssh
// session (closing one leaves "tmux" running; redial re-attaches) and answers
// the one-shot tmux commands.
type fakeHost struct {
	mu      sync.Mutex
	cmds    []string
	cur     *io.PipeWriter
	dialErr error         // next dial fails with this
	gate    chan struct{} // when set, dials wait for it
	inDial  bool          // a dial is waiting on gate
	dial    int           // successful dials (the attach command ran this many times)
	pos     string        // "tmux display" output
	scr     string        // "tmux capture-pane" output
	capErr  error
	deadErr error // "tmux has-session" result

	openPipe func(trDone <-chan struct{}) (io.ReadCloser, error) // per transport (pipe_test.go)
	end      func()                                              // ends the current transport like a shell exit
}

func (h *fakeHost) run(cmd string) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cmds = append(h.cmds, cmd)
	switch {
	case strings.HasPrefix(cmd, "tmux display"):
		return h.pos, nil
	case strings.HasPrefix(cmd, "tmux capture-pane"):
		return h.scr, h.capErr
	case strings.HasPrefix(cmd, "tmux has-session"):
		return "", h.deadErr
	}
	return "", nil
}

func (h *fakeHost) set(f func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	f()
}

// count is how many commands so far contain sub.
func (h *fakeHost) count(sub string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, c := range h.cmds {
		if strings.Contains(c, sub) {
			n++
		}
	}
	return n
}

func (h *fakeHost) attach() (*session, error) {
	h.mu.Lock()
	gate := h.gate
	h.inDial = gate != nil
	h.mu.Unlock()
	if gate != nil {
		<-gate
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.dialErr != nil {
		return nil, h.dialErr
	}
	h.dial++
	pr, pw := io.Pipe()
	h.cur = pw
	w := newWaiter()
	var once sync.Once
	end := func() { once.Do(func() { _ = pw.Close(); w.finish(0) }) }
	h.end = end
	s := &session{
		r: pr, w: io.Discard, wait: w, resize: func(uint16, uint16) {},
		kill:  func() { end(); <-w.done },
		close: end,
		link:  &tmuxLink{run: h.run, id: "abc", redial: h.attach},
	}
	if op := h.openPipe; op != nil {
		s.openPipe = func() (io.ReadCloser, error) { return op(w.done) }
	}
	wrapTmuxKill(s, h.run, "abc")
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
	return newRigOn(t, &fakeHost{})
}

// newRigOn is newParkRig on a prepared host.
func newRigOn(t *testing.T, h *fakeHost) *parkRig {
	t.Helper()
	reg := NewRegistry(nil, 0)
	tick := make(chan time.Time)
	reg.parkTicker = func() (<-chan time.Time, func()) { return tick, func() {} }
	tr, _ := h.attach()
	s := reg.addID("abc", "ssh-host", "", tr)
	t.Cleanup(func() {
		h.set(func() {
			if h.gate != nil && h.inDial {
				close(h.gate)
				h.gate = nil
			}
		})
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

// park brings r to the parked state.
func (r *parkRig) park(t *testing.T) {
	t.Helper()
	r.prompt(t)
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
}

const atPrompt = "\x1b]133;C\x07one\ntwo\nthree\n\x1b]133;D;0\x07\x1b]133;A\x07$ "

func (r *parkRig) events() []journal.Event { return r.s.j.buf.Since(0) }

// A pane idling after B (prompt drawn, input starts) parks; one after C
// (command running) never does (TestRunningCommandNeverParks).
func TestParkIdleAfterB(t *testing.T) {
	r := newParkRig(t)
	r.h.say(t, "\x1b]133;A\x07$ \x1b]133;B\x07")
	waitFor(t, func() bool { return r.s.j.idle(time.Now().Add(time.Hour), parkAfter) })
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
}

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
	for _, mark := range []string{"C"} {
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
	r.park(t)
	a, _, err := r.s.attachUnparked()
	if err != nil || a == nil {
		t.Fatalf("attach: %v", err)
	}
	defer r.s.detach(a)
	if r.parked() || r.h.dials() != 2 {
		t.Fatalf("parked=%v dials=%d", r.parked(), r.h.dials())
	}
	if r.h.count("kill-session") != 0 {
		t.Fatal("unpark must keep the tmux session")
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
	r.park(t)
	r.h.set(func() { r.h.dialErr = errors.New("dial refused") })
	if a, _, err := r.s.attachUnparked(); err == nil || a != nil {
		t.Fatal("want unpark error and no attachment")
	}
	if !r.parked() || r.reg.get("abc") == nil {
		t.Fatal("failed unpark must leave the session parked and registered")
	}
}

func TestUnparkDeadTmuxEndsSession(t *testing.T) {
	r := newParkRig(t)
	r.park(t)
	r.h.set(func() { r.h.deadErr = &ssh.ExitError{} })
	if _, _, err := r.s.attachUnparked(); err != nil {
		t.Fatalf("a dead shell is an exit, not an error: %v", err)
	}
	waitFor(t, func() bool { return r.reg.get("abc") == nil })
	if r.h.dials() != 1 {
		t.Fatalf("a fresh shell was started: dials=%d", r.h.dials())
	}
}

func TestUnparkHasSessionErrorKeepsParked(t *testing.T) {
	r := newParkRig(t)
	r.park(t)
	r.h.set(func() { r.h.deadErr = errors.New("dial failed") })
	if _, _, err := r.s.attachUnparked(); err == nil {
		t.Fatal("want error")
	}
	if !r.parked() || r.reg.get("abc") == nil || r.h.dials() != 1 {
		t.Fatal("an unreachable host must leave the session parked")
	}
}

func TestKillWhileParkedRemovesSession(t *testing.T) {
	r := newParkRig(t)
	r.park(t)
	r.s.kill()
	waitFor(t, func() bool { return r.reg.get("abc") == nil })
	waitFor(t, func() bool { return r.h.count("tmux kill-session -t '=tdog-abc'") > 0 })
	select {
	case <-r.s.ended:
	case <-time.After(3 * time.Second):
		t.Fatal("pump did not end")
	}
}

func TestAttachRacingPark(t *testing.T) {
	r := newParkRig(t)
	r.prompt(t)
	ticked := make(chan struct{})
	go func() { r.idleFor(parkAfter + time.Second); close(ticked) }()
	a, _, err := r.s.attachUnparked()
	if err != nil || a == nil {
		t.Fatalf("attach: %v", err)
	}
	defer r.s.detach(a)
	<-ticked
	if r.parked() {
		t.Fatal("parked under an attached browser")
	}
	r.h.say(t, "live\n")
	select {
	case b := <-a.ch:
		if !strings.Contains(string(b), "live") {
			t.Fatalf("got %q", b)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("attachment gets no output")
	}
}

func TestConcurrentAttachesUnparkOnce(t *testing.T) {
	r := newParkRig(t)
	r.park(t)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a, _, err := r.s.attachUnparked()
			if err == nil && a == nil {
				err = errors.New("no attachment")
			}
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if r.parked() || r.h.dials() != 2 {
		t.Fatalf("parked=%v dials=%d (want one re-dial)", r.parked(), r.h.dials())
	}
}

func TestKillDuringUnparkDial(t *testing.T) {
	r := newParkRig(t)
	r.park(t)
	gate := make(chan struct{})
	r.h.set(func() { r.h.gate = gate })
	res := make(chan error, 1)
	go func() { _, _, err := r.s.attachUnparked(); res <- err }()
	waitFor(t, func() bool {
		r.h.mu.Lock()
		defer r.h.mu.Unlock()
		return r.h.inDial
	})
	r.s.kill()
	waitFor(t, func() bool { return r.reg.get("abc") == nil })
	r.h.set(func() { r.h.gate = nil })
	close(gate)
	if err := <-res; err == nil {
		t.Fatal("unpark after kill must fail")
	}
	// The attach that raced the kill is torn down with its tmux session.
	waitFor(t, func() bool { return r.h.count("tmux kill-session -t '=tdog-abc'") >= 2 })
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
	s.close() // park
	select {
	case <-s.wait.done:
	case <-time.After(3 * time.Second):
		t.Fatal("park did not end the transport")
	}
	ns, err := s.link.redial()
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

func TestTmuxLinkCommands(t *testing.T) {
	h := &fakeHost{pos: "120 7\n"}
	l := &tmuxLink{run: h.run, id: "abc"}
	if p, err := l.position(); err != nil || p != 127 {
		t.Fatalf("pos=%d err=%v", p, err)
	}
	h.set(func() { h.pos = "junk" })
	if _, err := l.position(); err == nil {
		t.Fatal("bad display output must fail")
	}
	if ok, err := l.alive(); !ok || err != nil {
		t.Fatalf("alive=%v err=%v", ok, err)
	}
	h.set(func() { h.deadErr = &ssh.ExitError{} })
	if ok, err := l.alive(); ok || err != nil {
		t.Fatalf("dead: alive=%v err=%v", ok, err)
	}
	want := []string{
		"tmux display -p -t '=tdog-abc:' '#{history_size} #{cursor_y}'",
		"tmux display -p -t '=tdog-abc:' '#{history_size} #{cursor_y}'",
		"tmux has-session -t '=tdog-abc'",
		"tmux has-session -t '=tdog-abc'",
	}
	if strings.Join(h.cmds, "|") != strings.Join(want, "|") {
		t.Fatalf("cmds %q", h.cmds)
	}
}
