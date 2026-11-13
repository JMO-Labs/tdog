package term

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/coder/websocket"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

func newSigner(t *testing.T) (ssh.Signer, []byte) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	blk, err := ssh.MarshalPrivateKey(priv, "")
	if err != nil {
		t.Fatal(err)
	}
	s, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	return s, pem.EncodeToMemory(blk)
}

// fakeSSHD is an in-process server: pty-req + shell; echoes input as "got:<line>",
// reports window-change as "size:<rows>x<cols>", and "exit N" ends with status N.
type fakeSSHD struct {
	addr     string
	mu       sync.Mutex
	closedCh chan struct{} // closed when the session channel closes
}

func startFakeSSHD(t *testing.T, hostKey ssh.Signer) *fakeSSHD {
	t.Helper()
	cfg := &ssh.ServerConfig{NoClientAuth: false, PublicKeyCallback: func(ssh.ConnMetadata, ssh.PublicKey) (*ssh.Permissions, error) { return nil, nil }}
	cfg.AddHostKey(hostKey)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	d := &fakeSSHD{addr: ln.Addr().String(), closedCh: make(chan struct{})}
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			go d.handle(nc, cfg)
		}
	}()
	return d
}

func (d *fakeSSHD) handle(nc net.Conn, cfg *ssh.ServerConfig) {
	conn, chans, reqs, err := ssh.NewServerConn(nc, cfg)
	if err != nil {
		return
	}
	defer func() { _ = conn.Close() }()
	go ssh.DiscardRequests(reqs)
	for nch := range chans {
		ch, creqs, err := nch.Accept()
		if err != nil {
			return
		}
		go func() {
			for r := range creqs {
				switch r.Type {
				case "pty-req", "shell":
					_ = r.Reply(true, nil)
				case "window-change":
					rows := int(r.Payload[4])<<24 | int(r.Payload[5])<<16 | int(r.Payload[6])<<8 | int(r.Payload[7])
					cols := int(r.Payload[0])<<24 | int(r.Payload[1])<<16 | int(r.Payload[2])<<8 | int(r.Payload[3])
					_, _ = ch.Write([]byte(fmt.Sprintf("size:%03dx%d\n", rows, cols)))
				}
			}
			d.mu.Lock()
			select {
			case <-d.closedCh:
			default:
				close(d.closedCh)
			}
			d.mu.Unlock()
		}()
		go func() {
			buf := make([]byte, 1024)
			for {
				n, err := ch.Read(buf)
				if err != nil {
					return
				}
				line := strings.TrimSpace(string(buf[:n]))
				if line == "exit 3" {
					_, _ = ch.SendRequest("exit-status", false, []byte{0, 0, 0, 3})
					_ = ch.Close()
					return
				}
				_, _ = ch.Write([]byte("got:" + line + "\n"))
			}
		}()
	}
}

func sshDial(t *testing.T, cfg SSHConfig) (*websocket.Conn, context.Context) {
	t.Helper()
	srv := httptest.NewServer(NewHandler(Config{Shell: "/bin/sh", SSH: cfg}))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"?target=ssh-host", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c, ctx
}

func sshSetup(t *testing.T) (SSHConfig, *fakeSSHD, ssh.Signer) {
	t.Helper()
	hostKey, _ := newSigner(t)
	d := startFakeSSHD(t, hostKey)
	_, keyPEM := newSigner(t)
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "id_ed25519")
	if err := os.WriteFile(keyPath, keyPEM, 0o600); err != nil {
		t.Fatal(err)
	}
	host, port, _ := net.SplitHostPort(d.addr)
	return SSHConfig{Host: host, Port: port, User: "u", KeyPath: keyPath, KnownHostsPath: filepath.Join(dir, "sub", "known_hosts")}, d, hostKey
}

func TestSSHEchoResizeExit(t *testing.T) {
	cfg, _, _ := sshSetup(t)
	c, ctx := sshDial(t, cfg)
	send(t, ctx, c, frame.Input, "hello\n")
	readUntil(t, ctx, c, "got:hello")
	send(t, ctx, c, frame.Resize, `{"cols":123,"rows":45}`)
	readUntil(t, ctx, c, "size:045x123")
	send(t, ctx, c, frame.Input, "exit 3\n")
	_, ctl := readUntil(t, ctx, c, "")
	var v struct {
		Type string `json:"type"`
		Code int    `json:"code"`
	}
	if err := json.Unmarshal(ctl, &v); err != nil || v.Type != "exit" || v.Code != 3 {
		t.Fatalf("ctl %q err %v", ctl, err)
	}
	if b, err := os.ReadFile(cfg.KnownHostsPath); err != nil || !strings.Contains(string(b), "ssh-ed25519") {
		t.Fatalf("host key not pinned: %q %v", b, err)
	}
}

func TestSSHSocketCloseClosesChannel(t *testing.T) {
	cfg, d, _ := sshSetup(t)
	c, ctx := sshDial(t, cfg)
	send(t, ctx, c, frame.Input, "hi\n")
	readUntil(t, ctx, c, "got:hi")
	_ = c.CloseNow()
	select {
	case <-d.closedCh:
	case <-time.After(5 * time.Second):
		t.Fatal("remote channel not closed")
	}
}

func TestSSHHostKeyMismatchRefused(t *testing.T) {
	cfg, _, _ := sshSetup(t)
	c, ctx := sshDial(t, cfg)
	send(t, ctx, c, frame.Input, "x\n")
	readUntil(t, ctx, c, "got:x") // pins first key
	_ = c.CloseNow()

	// A different server (new host key) on the same host:port is not possible, so
	// rewrite the pin to another key for this address instead.
	other, _ := newSigner(t)
	line := knownhosts.Line([]string{net.JoinHostPort(cfg.Host, cfg.Port)}, other.PublicKey())
	if err := os.WriteFile(cfg.KnownHostsPath, []byte(line+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	c2, ctx2 := sshDial(t, cfg)
	_, ctl := readUntil(t, ctx2, c2, "")
	var v struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(ctl, &v); err != nil || v.Type != "error" || !strings.Contains(v.Message, "host key") {
		t.Fatalf("ctl %q err %v", ctl, err)
	}
}

func TestSSHMissingKeyReportsError(t *testing.T) {
	cfg, _, _ := sshSetup(t)
	cfg.KeyPath = filepath.Join(t.TempDir(), "nope")
	c, ctx := sshDial(t, cfg)
	_, ctl := readUntil(t, ctx, c, "")
	if !strings.Contains(string(ctl), `"error"`) {
		t.Fatalf("ctl %q", ctl)
	}
}

func TestUnknownTargetRejected(t *testing.T) {
	srv := httptest.NewServer(NewHandler(Config{}))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"?target=bogus", nil)
	if err == nil || resp == nil || resp.StatusCode != 400 {
		t.Fatalf("err %v resp %v", err, resp)
	}
}

func TestSSHConfigFromEnvDefaults(t *testing.T) {
	t.Setenv("TDOG_SSH_HOST", "")
	t.Setenv("TDOG_SSH_PORT", "")
	t.Setenv("TDOG_SSH_USER", "bob")
	cfg := SSHConfigFromEnv()
	if cfg.Host != "host.docker.internal" || cfg.Port != "22" || cfg.User != "bob" ||
		cfg.KeyPath != "/data/ssh/id_ed25519" || cfg.KnownHostsPath != "/data/ssh/known_hosts" {
		t.Fatalf("%+v", cfg)
	}
}
