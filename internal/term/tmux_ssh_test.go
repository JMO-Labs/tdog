package term

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"golang.org/x/crypto/ssh"
)

func TestSSHRunnerReturnsOutputAndExitError(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	d.execOut = "tdog-aa11\n"
	out, err := sshRunner(cfg)("tmux list-sessions")
	if err != nil || out != "tdog-aa11\n" {
		t.Fatalf("out=%q err=%v", out, err)
	}
	d.execExit = 1
	var ee *ssh.ExitError
	if _, err := sshRunner(cfg)("x"); !errors.As(err, &ee) {
		t.Fatalf("want ExitError, got %v", err)
	}
}

func TestSSHRunnerDialAndSessionErrors(t *testing.T) {
	cfg, _, hostKey := sshSetup(t)
	bad := cfg
	bad.KeyPath = cfg.KeyPath + ".missing"
	if _, err := sshRunner(bad)("x"); err == nil {
		t.Fatal("missing key must fail")
	}
	cfg.Host, cfg.Port = scriptedSSHD(t, hostKey, "nosession")
	if _, err := sshRunner(cfg)("x"); err == nil {
		t.Fatal("rejected session must fail")
	}
}

func TestSpawnTmuxAttachesAndKills(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	s, err := spawnTmux(cfg, sshRunner(cfg), "abc")
	if err != nil {
		t.Fatal(err)
	}
	s.kill()
	log := strings.Join(d.execLog(), "|")
	if !strings.Contains(log, "tmux new -A -s tdog-abc") || !strings.Contains(log, "tmux kill-session -t tdog-abc") {
		t.Fatalf("execs: %q", log)
	}
}

func TestSpawnTmuxDialFailure(t *testing.T) {
	cfg, _, _ := sshSetup(t)
	cfg.KeyPath += ".missing"
	if _, err := spawnTmux(cfg, (&fakeRun{}).run, "abc"); err == nil {
		t.Fatal("want error")
	}
}

func TestSpawnSSHCmdStartFailure(t *testing.T) {
	cfg, _, hostKey := sshSetup(t)
	cfg.Host, cfg.Port = scriptedSSHD(t, hostKey, "noexec")
	_, err := spawnSSHCmd(cfg, "tmux new -A -s tdog-x")
	if err == nil || !strings.Contains(err.Error(), "ssh shell failed") {
		t.Fatalf("err = %v", err)
	}
}

func TestWrapTmuxKillLogsFailureAndStillKills(t *testing.T) {
	killed := false
	s := &session{kill: func() { killed = true }}
	wrapTmuxKill(s, (&fakeRun{err: errors.New("boom")}).run, "abc")
	s.kill()
	if !killed {
		t.Fatal("original kill must still run")
	}
}

func TestRediscoverListError(t *testing.T) {
	reg := NewRegistry(nil, 0)
	n, err := reg.Rediscover((&fakeRun{err: errors.New("dial")}).run, nil)
	if err == nil || n != 0 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}

func TestRediscoverSpawnError(t *testing.T) {
	reg := NewRegistry(nil, 0)
	f := &fakeRun{out: "tdog-aa11\n"}
	n, err := reg.Rediscover(f.run, func(string) (*session, error) { return nil, errors.New("nope") })
	if err == nil || n != 0 || !strings.Contains(err.Error(), "reattach aa11") {
		t.Fatalf("n=%d err=%v", n, err)
	}
}

func TestRediscoverSSHReattaches(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	d.execOut = "tdog-aa11\nother\n"
	reg := NewRegistry(nil, 0)
	t.Cleanup(reg.KillAll)
	n, err := reg.RediscoverSSH(cfg)
	if err != nil || n != 1 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	if reg.get("aa11") == nil {
		t.Fatal("session not registered")
	}
}

func TestHandlerPersistentSSHUsesTmux(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	testReg = NewRegistry(nil, 0)
	t.Cleanup(testReg.KillAll)
	c, ctx := dialHandlerQuery(t, Config{SSH: cfg, Registry: testReg}, "?target=ssh-host&persistent=1")
	_ = ctx
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if l := d.execLog(); len(l) > 0 {
			if !strings.HasPrefix(l[0], "tmux new -A -s tdog-") {
				t.Fatalf("exec = %q", l[0])
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("no tmux attach exec seen")
}

func dialHandlerQuery(t *testing.T, cfg Config, query string) (*websocket.Conn, context.Context) {
	t.Helper()
	srv := httptest.NewServer(NewHandler(cfg))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+query, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c, ctx
}
