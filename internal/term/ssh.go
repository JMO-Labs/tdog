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

func serveSSH(c *websocket.Conn, cfg SSHConfig) {
	client, err := dialSSH(cfg)
	if err != nil {
		sshFail(c, "ssh connect failed: "+err.Error())
		return
	}
	sess, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		sshFail(c, "ssh session failed: "+err.Error())
		return
	}
	stdin, _ := sess.StdinPipe()
	stdout, _ := sess.StdoutPipe() // stderr is merged into the pty by the server
	if err := sess.RequestPty("xterm-256color", 24, 80, ssh.TerminalModes{ssh.ECHO: 1}); err != nil {
		_ = client.Close()
		sshFail(c, "ssh pty request failed: "+err.Error())
		return
	}
	if err := sess.Shell(); err != nil {
		_ = client.Close()
		sshFail(c, "ssh shell failed: "+err.Error())
		return
	}
	waitCh := make(chan int, 1)
	go func() {
		err := sess.Wait()
		code := 0
		var ee *ssh.ExitError
		var em *ssh.ExitMissingError
		switch {
		case err == nil:
		case errors.As(err, &ee):
			code = ee.ExitStatus()
		case errors.As(err, &em):
			code = 1
		default:
			code = 255
		}
		waitCh <- code
	}()
	closeAll := func() { _ = client.Close() }
	runSession(c, &session{
		r: stdout, w: stdin,
		resize: func(cols, rows uint16) { _ = sess.WindowChange(int(rows), int(cols)) },
		wait:   waitCh,
		kill: func() { // closing the client hangs up the remote pty
			closeAll()
			<-waitCh
		},
		close: closeAll,
	})
}
