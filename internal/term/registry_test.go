package term

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/coder/websocket"
)

type rig struct {
	t   *testing.T
	srv *httptest.Server
	reg *Registry
	log *audit.Logger
	ctx context.Context
}

func newRig(t *testing.T) *rig {
	t.Helper()
	l := audit.New(filepath.Join(t.TempDir(), "audit.log"))
	reg := NewRegistry(l, 0)
	srv := httptest.NewServer(NewHandler(Config{Shell: "/bin/sh", Audit: l, Registry: reg}))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	t.Cleanup(reg.KillAll)
	return &rig{t: t, srv: srv, reg: reg, log: l, ctx: ctx}
}

func (r *rig) dial(query string) (*websocket.Conn, error) {
	c, _, err := websocket.Dial(r.ctx, "ws"+strings.TrimPrefix(r.srv.URL, "http")+"/?"+query, nil)
	if err == nil {
		r.t.Cleanup(func() { _ = c.CloseNow() })
	}
	return c, err
}

// start dials a new session and returns its id from the first Control frame.
func (r *rig) start(query string) (*websocket.Conn, string) {
	r.t.Helper()
	c, err := r.dial(query)
	if err != nil {
		r.t.Fatal(err)
	}
	ctl := readSession(r.t, r.ctx, c)
	var v struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}
	if err := json.Unmarshal(ctl, &v); err != nil || v.Type != "session" {
		r.t.Fatalf("first control %q: %v", ctl, err)
	}
	return c, v.ID
}

func TestStartSendsRandom128BitID(t *testing.T) {
	r := newRig(t)
	_, a := r.start("")
	_, b := r.start("")
	if len(a) != 32 || len(b) != 32 || a == b {
		t.Fatalf("ids %q %q", a, b)
	}
}

func TestShellSurvivesDetachAndReplaysScrollback(t *testing.T) {
	r := newRig(t)
	c, id := r.start("")
	send(t, r.ctx, c, frame.Input, "echo $((20+22))\n")
	readUntil(t, r.ctx, c, "42")
	_ = c.CloseNow()

	c2, err := r.dial("id=" + id)
	if err != nil {
		t.Fatal(err)
	}
	out, ctl := readUntil(t, r.ctx, c2, "42") // replay arrives before any new input
	if ctl != nil || !strings.Contains(out, "42") {
		t.Fatalf("replay %q ctl %q", out, ctl)
	}
	// still the same live shell
	send(t, r.ctx, c2, frame.Input, "echo $((6*7+1))\n")
	if out, _ := readUntil(t, r.ctx, c2, "43"); !strings.Contains(out, "43") {
		t.Fatalf("got %q", out)
	}
}

func TestSecondAttachReplacesFirst(t *testing.T) {
	r := newRig(t)
	c1, id := r.start("")
	c2, err := r.dial("id=" + id)
	if err != nil {
		t.Fatal(err)
	}
	for { // old socket is closed with a reason
		_, _, err := c1.Read(r.ctx)
		if err == nil {
			continue
		}
		if websocket.CloseStatus(err) != websocket.StatusPolicyViolation || !strings.Contains(err.Error(), "replaced") {
			t.Fatalf("got %v", err)
		}
		break
	}
	send(t, r.ctx, c2, frame.Input, "echo $((20+22))\n")
	if out, _ := readUntil(t, r.ctx, c2, "42"); !strings.Contains(out, "42") {
		t.Fatalf("got %q", out)
	}
}

func TestUnknownIDRejected(t *testing.T) {
	r := newRig(t)
	if _, err := r.dial("id=deadbeef"); err == nil {
		t.Fatal("expected failure")
	}
}

func TestListShowsSessions(t *testing.T) {
	r := newRig(t)
	c, id := r.start("scene=build")
	rec := httptest.NewRecorder()
	r.reg.ListHandler().ServeHTTP(rec, httptest.NewRequest("GET", "/api/sessions", nil))
	var list []Info
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("list %+v", list)
	}
	got := list[0]
	if got.ID != id || got.Scene != "build" || got.Target != "container" || got.PID <= 0 || !got.Attached || got.Started.IsZero() {
		t.Fatalf("got %+v", got)
	}
	_ = c.CloseNow()
	waitFor(t, func() bool { l := r.reg.List(); return len(l) == 1 && !l[0].Attached })
}

func TestBadSceneRejected(t *testing.T) {
	r := newRig(t)
	if _, err := r.dial("scene=" + strings.Repeat("x", 100)); err == nil {
		t.Fatal("expected failure")
	}
}

func TestExitRemovesSession(t *testing.T) {
	r := newRig(t)
	c, _ := r.start("")
	send(t, r.ctx, c, frame.Input, "exit 4\n")
	_, ctl := readUntil(t, r.ctx, c, "")
	if !strings.Contains(string(ctl), `"code":4`) {
		t.Fatalf("ctl %q", ctl)
	}
	waitFor(t, func() bool { return len(r.reg.List()) == 0 })
}

func TestKillHangsUpShell(t *testing.T) {
	r := newRig(t)
	c, id := r.start("")
	_ = c.CloseNow()
	if !r.reg.Kill(id) {
		t.Fatal("kill: not found")
	}
	waitFor(t, func() bool { return len(r.reg.List()) == 0 })
	if r.reg.Kill(id) {
		t.Fatal("second kill should miss")
	}
}

func TestAuditAttachDetach(t *testing.T) {
	r := newRig(t)
	c, id := r.start("")
	_ = c.CloseNow()
	waitFor(t, func() bool {
		ev := map[string]bool{}
		for _, e := range r.log.Recent(20) {
			if e.Session == id {
				ev[e.Event] = true
			}
		}
		return ev["attach"] && ev["detach"]
	})
}

func TestConcurrentAttachAndExit(t *testing.T) {
	r := newRig(t)
	_, id := r.start("")
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if c, err := r.dial("id=" + id); err == nil {
				_ = c.CloseNow()
			}
		}()
	}
	// Write to the PTY directly: input sent on a socket may be dropped once a
	// concurrent attach has replaced it.
	if _, err := r.reg.get(id).s.w.Write([]byte("exit 0\n")); err != nil {
		t.Fatal(err)
	}
	wg.Wait() // dial registers t.Cleanup; it must not run after the test ends
	waitFor(t, func() bool { return len(r.reg.List()) == 0 })
}

func TestRingKeepsNewestBytes(t *testing.T) {
	g := newRing(8)
	g.write([]byte("abcdef"))
	g.write([]byte("ghij"))
	if got := string(g.snapshot()); got != "cdefghij" {
		t.Fatalf("got %q", got)
	}
	g.write([]byte("0123456789AB")) // larger than capacity
	if got := string(g.snapshot()); got != "456789AB" {
		t.Fatalf("got %q", got)
	}
	if got := string(newRing(8).snapshot()); got != "" {
		t.Fatalf("got %q", got)
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met")
		}
		time.Sleep(20 * time.Millisecond)
	}
}
