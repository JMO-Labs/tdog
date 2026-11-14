package term

import (
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
)

// scriptedSSHD accepts auth, then fails or short-circuits one stage by mode:
// "nosession", "nopty", "noshell", "exit0".
func scriptedSSHD(t *testing.T, hostKey ssh.Signer, mode string) (host, port string) {
	t.Helper()
	cfg := &ssh.ServerConfig{PublicKeyCallback: func(ssh.ConnMetadata, ssh.PublicKey) (*ssh.Permissions, error) { return nil, nil }}
	cfg.AddHostKey(hostKey)
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
					if mode == "nosession" {
						_ = nch.Reject(ssh.ResourceShortage, "no")
						continue
					}
					ch, creqs, err := nch.Accept()
					if err != nil {
						return
					}
					go func() {
						for r := range creqs {
							switch r.Type {
							case "pty-req":
								_ = r.Reply(mode != "nopty", nil)
							case "shell":
								_ = r.Reply(mode != "noshell", nil)
								if mode == "exit0" {
									_, _ = ch.SendRequest("exit-status", false, []byte{0, 0, 0, 0})
									_ = ch.Close()
								}
							}
						}
					}()
				}
			}()
		}
	}()
	host, port, _ = net.SplitHostPort(ln.Addr().String())
	return
}

func ctlOf(t *testing.T, cfg SSHConfig) map[string]any {
	t.Helper()
	c, ctx := sshDial(t, cfg)
	_, ctl := readUntil(t, ctx, c, "")
	var v map[string]any
	if err := json.Unmarshal(ctl, &v); err != nil {
		t.Fatalf("ctl %q: %v", ctl, err)
	}
	return v
}

func TestSSHStageFailuresReportError(t *testing.T) {
	for mode, want := range map[string]string{
		"nosession": "ssh session failed",
		"nopty":     "ssh pty request failed",
		"noshell":   "ssh shell failed",
	} {
		t.Run(mode, func(t *testing.T) {
			cfg, _, hostKey := sshSetup(t)
			cfg.Host, cfg.Port = scriptedSSHD(t, hostKey, mode)
			v := ctlOf(t, cfg)
			if v["type"] != "error" || !strings.Contains(v["message"].(string), want) {
				t.Fatalf("ctl %v want %q", v, want)
			}
		})
	}
}

func TestSSHCleanExitReportsZero(t *testing.T) {
	cfg, _, hostKey := sshSetup(t)
	cfg.Host, cfg.Port = scriptedSSHD(t, hostKey, "exit0")
	v := ctlOf(t, cfg)
	if v["type"] != "exit" || v["code"] != float64(0) {
		t.Fatalf("ctl %v", v)
	}
}

func TestSSHInvalidKeyReportsError(t *testing.T) {
	cfg, _, _ := sshSetup(t)
	if err := os.WriteFile(cfg.KeyPath, []byte("not a key"), 0o600); err != nil {
		t.Fatal(err)
	}
	v := ctlOf(t, cfg)
	if v["type"] != "error" || !strings.Contains(v["message"].(string), "ssh key invalid") {
		t.Fatalf("ctl %v", v)
	}
}

func TestExitCode(t *testing.T) {
	if got := exitCode(nil); got != 0 {
		t.Fatalf("nil: %d", got)
	}
	if got := exitCode(&ssh.ExitMissingError{}); got != 1 {
		t.Fatalf("missing: %d", got)
	}
	if got := exitCode(errors.New("boom")); got != 255 {
		t.Fatalf("other: %d", got)
	}
}

func callTOFU(t *testing.T, path string, key ssh.PublicKey) error {
	t.Helper()
	return tofuCallback(path)("example.test:22", &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 22}, key)
}

func TestTOFUKnownKeyAccepted(t *testing.T) {
	signer, _ := newSigner(t)
	path := filepath.Join(t.TempDir(), "kh")
	if err := callTOFU(t, path, signer.PublicKey()); err != nil {
		t.Fatalf("first use: %v", err)
	}
	if err := callTOFU(t, path, signer.PublicKey()); err != nil {
		t.Fatalf("pinned key: %v", err)
	}
}

func TestTOFUMkdirFails(t *testing.T) {
	signer, _ := newSigner(t)
	file := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := callTOFU(t, filepath.Join(file, "sub", "kh"), signer.PublicKey()); err == nil {
		t.Fatal("want error")
	}
}

func TestTOFUOpenFails(t *testing.T) {
	signer, _ := newSigner(t)
	path := filepath.Join(t.TempDir(), "kh")
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := callTOFU(t, path, signer.PublicKey()); err == nil {
		t.Fatal("want error")
	}
}

func TestTOFUMalformedFile(t *testing.T) {
	signer, _ := newSigner(t)
	path := filepath.Join(t.TempDir(), "kh")
	if err := os.WriteFile(path, []byte("example.test ssh-ed25519 !!notbase64!!\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := callTOFU(t, path, signer.PublicKey()); err == nil {
		t.Fatal("want error")
	}
}

func TestTOFUAppendFails(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores file modes")
	}
	signer, _ := newSigner(t)
	path := filepath.Join(t.TempDir(), "kh")
	if err := os.WriteFile(path, nil, 0o400); err != nil {
		t.Fatal(err)
	}
	if err := callTOFU(t, path, signer.PublicKey()); err == nil {
		t.Fatal("want error")
	}
}
