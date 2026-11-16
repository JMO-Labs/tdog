package term

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"golang.org/x/crypto/ssh"
)

// fakeRun records commands and replays canned output.
type fakeRun struct {
	mu   sync.Mutex
	cmds []string
	out  string
	err  error
}

func (f *fakeRun) run(cmd string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cmds = append(f.cmds, cmd)
	return f.out, f.err
}

func TestTmuxCommands(t *testing.T) {
	if got := tmuxAttachCmd("abc"); got != `tmux start-server \; if -F '#{e|<:#{history-limit},50000}' 'set -g history-limit 50000' \; new -A -s tdog-abc` {
		t.Fatalf("attach: %q", got)
	}
	f := &fakeRun{}
	if err := killTmux(f.run, "abc"); err != nil {
		t.Fatal(err)
	}
	if len(f.cmds) != 1 || f.cmds[0] != "tmux kill-session -t '=tdog-abc'" {
		t.Fatalf("kill cmds: %q", f.cmds)
	}
}

func TestListTmuxFiltersAndValidates(t *testing.T) {
	f := &fakeRun{out: "tdog-aa11\nother\ntdog-bb_2\ntdog-x;rm -rf /\ntdog-\n"}
	ids, err := listTmux(f.run)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(ids, ",") != "aa11,bb_2" {
		t.Fatalf("ids = %q", ids)
	}
}

func TestListTmuxNoServer(t *testing.T) {
	f := &fakeRun{err: &ssh.ExitError{}}
	ids, err := listTmux(f.run)
	if err != nil || len(ids) != 0 {
		t.Fatalf("no server should be empty, got %v %v", ids, err)
	}
	f = &fakeRun{err: errors.New("dial failed")}
	if _, err := listTmux(f.run); err == nil {
		t.Fatal("connect error must surface")
	}
}

func fakeShell() *session {
	pr, pw := io.Pipe()
	w := newWaiter()
	return &session{
		r: pr, w: io.Discard, wait: w, resize: func(uint16, uint16) {},
		kill:  func() { _ = pw.Close(); w.finish(0) },
		close: func() {},
	}
}

func TestRediscoverRegistersMissing(t *testing.T) {
	reg := NewRegistry(nil, 0)
	f := &fakeRun{out: "tdog-aa11\ntdog-bb22\n"}
	var spawned []string
	spawn := func(id string) (*session, error) { spawned = append(spawned, id); return fakeShell(), nil }
	n, err := reg.Rediscover(f.run, spawn)
	if err != nil || n != 2 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	rec := httptest.NewRecorder()
	reg.ListHandler().ServeHTTP(rec, httptest.NewRequest("GET", "/api/sessions", nil))
	body := rec.Body.String()
	for _, id := range []string{`"id":"aa11"`, `"id":"bb22"`} {
		if !strings.Contains(body, id) {
			t.Fatalf("list missing %s: %s", id, body)
		}
	}
	// Second run is idempotent.
	if n, _ := reg.Rediscover(f.run, spawn); n != 0 || len(spawned) != 2 {
		t.Fatalf("rediscover not idempotent: n=%d spawned=%v", n, spawned)
	}
	reg.KillAll()
}

func TestPersistentRejectedOnContainer(t *testing.T) {
	h := NewHandler(Config{Shell: "/bin/sh"})
	for _, q := range []string{"persistent=1", "target=container&persistent=1"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", "/?"+q, nil))
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "persistent requires the ssh-host target") {
			t.Fatalf("%s: %d %q", q, rec.Code, rec.Body.String())
		}
	}
}

func TestKillPersistentKillsTmux(t *testing.T) {
	f := &fakeRun{}
	killed := false
	base := &session{kill: func() { killed = true }}
	wrapTmuxKill(base, f.run, "abc")
	base.kill()
	if !killed || len(f.cmds) != 1 || f.cmds[0] != "tmux kill-session -t '=tdog-abc'" {
		t.Fatalf("killed=%v cmds=%q", killed, f.cmds)
	}
}
