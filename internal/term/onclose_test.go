package term

import (
	"context"
	"net"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/config"
	"github.com/JMO-Labs/tdog/internal/frame"
	"golang.org/x/crypto/ssh"
)

func closeAndWait(t *testing.T, toml string) audit.Entry {
	t.Helper()
	r := newPresetRig(t, map[string]string{"app": toml})
	c, _ := r.start("preset=app")
	send(t, r.ctx, c, frame.Input, "exit\n")
	return r.waitAudit("on_close")
}

func TestOnCloseFailureIsAudited(t *testing.T) {
	e := closeAndWait(t, `on_close = { mode = "all", run = ["exit 3"] }`)
	if !strings.Contains(e.Error, "exit status 3") {
		t.Fatalf("%+v", e)
	}
}

func TestOnCloseTimeoutIsAudited(t *testing.T) {
	old := onCloseTimeout
	onCloseTimeout = 200 * time.Millisecond
	t.Cleanup(func() { onCloseTimeout = old })
	e := closeAndWait(t, `on_close = { mode = "all", run = ["sleep 5"] }`)
	if !strings.Contains(e.Error, "timed out") {
		t.Fatalf("%+v", e)
	}
}

func TestOnCloseOutputIsClipped(t *testing.T) {
	e := closeAndWait(t, `on_close = { mode = "all", run = ["yes a | head -c 6000"] }`)
	if len(e.Output) > maxAuditOutput+len("…") || !strings.HasSuffix(e.Output, "…") {
		t.Fatalf("output len %d", len(e.Output))
	}
}

func TestClipKeepsShortOutput(t *testing.T) {
	if clip("abc") != "abc" {
		t.Fatal("short output changed")
	}
}

func TestExpandHome(t *testing.T) {
	t.Setenv("HOME", "/h")
	for in, want := range map[string]string{"~": "/h", "~/x": "/h/x", "~foo": "~foo", "/a": "/a", "": ""} {
		if got := expandHome(in); got != want {
			t.Errorf("expandHome(%q) = %q, want %q", in, got, want)
		}
	}
	t.Setenv("HOME", "")
	if got := expandHome("~/x"); got != "~/x" {
		t.Errorf("without HOME got %q", got)
	}
}

func TestSSHCombinedRunsCommand(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	d.execOut, d.execExit = "remote-out", 0
	out, err := sshCombined(context.Background(), cfg, "echo hi")
	if err != nil || out != "remote-out" {
		t.Fatalf("%q, %v", out, err)
	}
}

func TestSSHCombinedReportsExitError(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	d.execExit = 2
	if _, err := sshCombined(context.Background(), cfg, "false"); err == nil {
		t.Fatal("expected exit error")
	}
}

func TestSSHCombinedDialError(t *testing.T) {
	cfg, _, _ := sshSetup(t)
	cfg.KeyPath = filepath.Join(t.TempDir(), "missing")
	if _, err := sshCombined(context.Background(), cfg, "x"); err == nil {
		t.Fatal("expected dial error")
	}
}

func TestSSHCombinedStopsOnContextDone(t *testing.T) {
	cfg, _, _ := sshSetup(t)
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	_, err := sshCombined(ctx, cfg, "hang forever")
	if err != context.DeadlineExceeded {
		t.Fatalf("got %v", err)
	}
}

func TestSSHCombinedNewSessionFails(t *testing.T) {
	cfg, _, _ := sshSetup(t)
	hostKey, _ := newSigner(t)
	scfg := &ssh.ServerConfig{PublicKeyCallback: func(ssh.ConnMetadata, ssh.PublicKey) (*ssh.Permissions, error) { return nil, nil }}
	scfg.AddHostKey(hostKey)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		nc, err := ln.Accept()
		if err != nil {
			return
		}
		conn, chans, reqs, err := ssh.NewServerConn(nc, scfg)
		if err != nil {
			return
		}
		go ssh.DiscardRequests(reqs)
		for nch := range chans {
			_ = nch.Reject(ssh.Prohibited, "no sessions")
		}
		_ = conn.Close()
	}()
	cfg.Host, cfg.Port, _ = net.SplitHostPort(ln.Addr().String())
	if _, err := sshCombined(context.Background(), cfg, "x"); err == nil {
		t.Fatal("expected NewSession error")
	}
}

func TestOnCloseRunsOverSSHHost(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	d.execOut = "remote-out"
	dir, err := os.MkdirTemp("", "tdog-ssh-close")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	l := audit.New(filepath.Join(dir, "audit.log"))
	store := config.NewStore(t.TempDir())
	body := `target = "ssh-host"` + "\n" + `on_close = { mode = "all", run = ["echo a", "echo b"] }`
	if err := store.Put(config.KindTerminal, "app", []byte(body)); err != nil {
		t.Fatal(err)
	}
	reg := NewRegistry(l, 0)
	srv := httptest.NewServer(NewHandler(Config{Shell: "/bin/sh", SSH: cfg, Audit: l, Registry: reg, Presets: store}))
	t.Cleanup(srv.Close)
	t.Cleanup(reg.KillAll)
	rg := &rig{t: t, srv: srv, reg: reg, log: l}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	rg.ctx = ctx
	c, _ := rg.start("preset=app")
	send(t, rg.ctx, c, frame.Input, "exit 3\n")
	var e audit.Entry
	for deadline := time.Now().Add(10 * time.Second); time.Now().Before(deadline) && e.Event == ""; time.Sleep(20 * time.Millisecond) {
		for _, x := range l.Recent(50) {
			if x.Event == "on_close" {
				e = x
			}
		}
	}
	if e.Target != "ssh-host" || e.Output != "remote-out" {
		t.Fatalf("%+v", e)
	}
	var found bool
	for _, cmd := range d.execLog() {
		found = found || strings.Contains(cmd, "{ echo a; echo b; }")
	}
	if !found {
		t.Fatalf("execs %q", d.execLog())
	}
}

func TestLoadSpecErrors(t *testing.T) {
	if _, err := loadSpec(nil, "app", ""); err == nil {
		t.Error("nil store accepted")
	}
	dir := t.TempDir()
	store := config.NewStore(dir)
	if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte("not = [valid"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadSpec(store, "app", ""); err == nil {
		t.Error("bad global config accepted")
	}
	_ = os.Remove(filepath.Join(dir, "config.toml"))
	pdir := filepath.Join(dir, "presets", "terminals")
	if err := os.MkdirAll(pdir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pdir, "bad.toml"), []byte("bogus = 1"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadSpec(store, "bad", ""); err == nil {
		t.Error("undecodable preset accepted")
	}
	if err := store.Put(config.KindTerminal, "app", []byte(`command = "true"`)); err != nil {
		t.Fatal(err)
	}
	if _, err := loadSpec(store, "app", strings.Repeat("#", maxOverrideLen+1)); err == nil || !strings.Contains(err.Error(), "too long") {
		t.Errorf("long override: %v", err)
	}
}

func TestPresetPersistentNeedsSSHHost(t *testing.T) {
	r := newPresetRig(t, map[string]string{"app": "persistent = true"})
	if _, err := r.dial("preset=app"); err == nil {
		t.Fatal("persistent container preset accepted")
	}
}

func TestRemoteOnCloseWrapsMultipleCommands(t *testing.T) {
	sp := Spec{OnClose: hook("all", "a", "b")}
	if got := sp.remoteOnClose(); !strings.Contains(got, "{ a; b; }") {
		t.Fatalf("%q", got)
	}
}
