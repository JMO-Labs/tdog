package server

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/JMO-Labs/tdog/internal/auth"
	"github.com/JMO-Labs/tdog/internal/term"
	"golang.org/x/crypto/ssh"
)

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuf) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

// listSSHD answers every exec with out and exit 0; it keeps tmux attach channels open.
func listSSHD(t *testing.T, out string) (host, port string) {
	t.Helper()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	hk, _ := ssh.NewSignerFromKey(priv)
	cfg := &ssh.ServerConfig{PublicKeyCallback: func(ssh.ConnMetadata, ssh.PublicKey) (*ssh.Permissions, error) { return nil, nil }}
	cfg.AddHostKey(hk)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				conn, chans, reqs, err := ssh.NewServerConn(nc, cfg)
				if err != nil {
					return
				}
				defer func() { _ = conn.Close() }()
				go ssh.DiscardRequests(reqs)
				for nch := range chans {
					ch, creqs, _ := nch.Accept()
					go func() {
						for r := range creqs {
							_ = r.Reply(r.Type == "pty-req" || r.Type == "exec", nil)
							if r.Type != "exec" || strings.Contains(string(r.Payload), "tmux new") {
								continue // pty-req, or attach that stays open
							}
							_, _ = ch.Write([]byte(out))
							_, _ = ch.SendRequest("exit-status", false, []byte{0, 0, 0, 0})
							_ = ch.Close()
						}
					}()
				}
			}()
		}
	}()
	host, port, _ = net.SplitHostPort(ln.Addr().String())
	return
}

func rediscoverLog(t *testing.T, host, port, want string) {
	t.Helper()
	dir := t.TempDir()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	blk, _ := ssh.MarshalPrivateKey(priv, "")
	key := filepath.Join(dir, "id")
	if err := os.WriteFile(key, pem.EncodeToMemory(blk), 0o600); err != nil {
		t.Fatal(err)
	}
	old := sshConfig
	sshConfig = func() term.SSHConfig {
		return term.SSHConfig{Host: host, Port: port, User: "u", KeyPath: key, KnownHostsPath: filepath.Join(dir, "kh")}
	}
	t.Cleanup(func() { sshConfig = old })
	buf := &syncBuf{}
	log.SetOutput(buf)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	a, err := auth.New(t.TempDir(), func(string, ...any) {})
	if err != nil {
		t.Fatal(err)
	}
	NewSecuredPresets(fstest.MapFS{"index.html": {Data: []byte("x")}}, a, nil)
	for end := time.Now().Add(5 * time.Second); time.Now().Before(end); time.Sleep(20 * time.Millisecond) {
		if strings.Contains(buf.String(), want) {
			return
		}
	}
	t.Fatalf("log missing %q: %q", want, buf.String())
}

func TestRediscoveryErrorIsLogged(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	_ = ln.Close() // nothing listens: dial fails
	rediscoverLog(t, host, port, "term: tmux rediscovery:")
}

func TestRediscoveryReattachIsLogged(t *testing.T) {
	host, port := listSSHD(t, "tdog-aa11\n")
	rediscoverLog(t, host, port, "reattached 1 tmux session(s)")
}
