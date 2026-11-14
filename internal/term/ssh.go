package term

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/coder/websocket"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// SSHConfig describes the ssh-host target (spec §6, ADR-0002).
type SSHConfig struct {
	Host, Port, User string
	KeyPath          string // private key, e.g. /data/ssh/id_ed25519
	KnownHostsPath   string // TOFU pin file, e.g. /data/ssh/known_hosts
}

// SSHConfigFromEnv reads TDOG_SSH_HOST/PORT/USER with spec defaults.
func SSHConfigFromEnv() SSHConfig {
	get := func(k, def string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return def
	}
	return SSHConfig{
		Host:           get("TDOG_SSH_HOST", "host.docker.internal"),
		Port:           get("TDOG_SSH_PORT", "22"),
		User:           get("TDOG_SSH_USER", get("USER", "root")),
		KeyPath:        "/data/ssh/id_ed25519",
		KnownHostsPath: "/data/ssh/known_hosts",
	}
}

var knownHostsMu sync.Mutex

// tofuCallback pins the host key on first use and rejects any later change.
func tofuCallback(path string) ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		knownHostsMu.Lock()
		defer knownHostsMu.Unlock()
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return err
		}
		f, err := os.OpenFile(path, os.O_CREATE|os.O_RDONLY, 0o600)
		if err != nil {
			return err
		}
		_ = f.Close()
		check, err := knownhosts.New(path)
		if err != nil {
			return err
		}
		err = check(hostname, remote, key)
		var ke *knownhosts.KeyError
		if err == nil || !errors.As(err, &ke) {
			return err
		}
		if len(ke.Want) > 0 {
			return fmt.Errorf("host key for %s changed (possible MITM); remove it from %s only if the change is expected", hostname, path)
		}
		out, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			return err
		}
		defer func() { _ = out.Close() }()
		_, err = fmt.Fprintln(out, knownhosts.Line([]string{hostname}, key))
		return err
	}
}

func dialSSH(cfg SSHConfig) (*ssh.Client, error) {
	keyBytes, err := os.ReadFile(cfg.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("ssh key unreadable (%s): %w", cfg.KeyPath, err)
	}
	signer, err := ssh.ParsePrivateKey(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("ssh key invalid: %w", err)
	}
	return ssh.Dial("tcp", net.JoinHostPort(cfg.Host, cfg.Port), &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: tofuCallback(cfg.KnownHostsPath),
		Timeout:         10 * time.Second,
	})
}

func sshFail(c *websocket.Conn, msg string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = c.Write(ctx, websocket.MessageBinary, frame.ErrorControl(msg))
	_ = c.Close(websocket.StatusNormalClosure, "ssh error")
}

// exitCode maps a session Wait error to a process-style exit code.
func exitCode(err error) int {
	var ee *ssh.ExitError
	var em *ssh.ExitMissingError
	switch {
	case err == nil:
		return 0
	case errors.As(err, &ee):
		return ee.ExitStatus()
	case errors.As(err, &em):
		return 1
	default:
		return 255
	}
}

func spawnSSH(cfg SSHConfig) (*session, error) {
	client, err := dialSSH(cfg)
	if err != nil {
		return nil, errors.New("ssh connect failed: " + err.Error())
	}
	fail := func(msg string, err error) (*session, error) {
		_ = client.Close()
		return nil, errors.New(msg + err.Error())
	}
	sess, err := client.NewSession()
	if err != nil {
		return fail("ssh session failed: ", err)
	}
	stdin, _ := sess.StdinPipe()
	stdout, _ := sess.StdoutPipe() // stderr is merged into the pty by the server
	if err := sess.RequestPty("xterm-256color", 24, 80, ssh.TerminalModes{ssh.ECHO: 1}); err != nil {
		return fail("ssh pty request failed: ", err)
	}
	if err := sess.Shell(); err != nil {
		return fail("ssh shell failed: ", err)
	}
	w := newWaiter()
	go func() { w.finish(exitCode(sess.Wait())) }()
	closeAll := func() { _ = client.Close() }
	return &session{
		r: stdout, w: stdin, wait: w,
		resize: func(cols, rows uint16) { _ = sess.WindowChange(int(rows), int(cols)) },
		kill: func() { // closing the client hangs up the remote pty
			closeAll()
			<-w.done
		},
		close: closeAll,
	}, nil
}
