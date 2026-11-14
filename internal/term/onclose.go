package term

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
)

// onCloseTimeout bounds an on_close hook (var so tests can shorten it).
var onCloseTimeout = 30 * time.Second

const maxAuditOutput = 4 << 10

// onCloseFn returns the function that runs sp.OnClose for session id once its
// terminal is gone (closed, killed or exited), or nil when there is none.
func (r *Registry) onCloseFn(sp Spec, shell string, ssh SSHConfig, id, target string) func() {
	if sp.OnClose == nil {
		return nil
	}
	return func() {
		ctx, cancel := context.WithTimeout(context.Background(), onCloseTimeout)
		defer cancel()
		var out string
		var err error
		if target == "ssh-host" {
			out, err = sshCombined(ctx, ssh, sp.remoteOnClose())
		} else {
			out, err = localCombined(ctx, shell, sp)
		}
		e := audit.Entry{Event: "on_close", Target: target, Session: id, Output: clip(out)}
		switch {
		case errors.Is(ctx.Err(), context.DeadlineExceeded):
			e.Error = fmt.Sprintf("timed out after %s", onCloseTimeout)
		case err != nil:
			e.Error = err.Error()
		}
		r.audit.Log(e)
	}
}

func clip(s string) string {
	if len(s) > maxAuditOutput {
		return s[:maxAuditOutput] + "…"
	}
	return s
}

// localCombined runs the hook non-interactively in the container: the script
// is a single argv element to "<shell> -c", never part of a larger command.
func localCombined(ctx context.Context, shell string, sp Spec) (string, error) {
	cmd := exec.CommandContext(ctx, shell, "-c", hookScript(sp.OnClose))
	cmd.Dir = expandHome(sp.Cwd)
	cmd.Env = launchEnv(sp.Env)
	cmd.WaitDelay = time.Second // do not wait on grandchildren holding the pipe
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// launchEnv is the process environment plus the preset's env.
func launchEnv(env map[string]string) []string {
	out := append(os.Environ(), "TERM=xterm-256color")
	for k, v := range env {
		out = append(out, k+"="+v)
	}
	return out
}

func expandHome(dir string) string {
	rest, ok := strings.CutPrefix(dir, "~")
	if !ok || (rest != "" && rest[0] != '/') {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return dir
	}
	return filepath.Join(home, rest)
}

type sshResult struct {
	out []byte
	err error
}

// sshCombined runs cmd on the host over its own connection until ctx ends.
func sshCombined(ctx context.Context, cfg SSHConfig, cmd string) (string, error) {
	client, err := dialSSH(cfg)
	if err != nil {
		return "", err
	}
	defer func() { _ = client.Close() }() // also unblocks the goroutine on timeout
	ch := make(chan sshResult, 1)
	go func() {
		sess, err := client.NewSession()
		if err != nil {
			ch <- sshResult{err: err}
			return
		}
		out, err := sess.CombinedOutput(cmd)
		ch <- sshResult{out, err}
	}()
	select {
	case r := <-ch:
		return string(r.out), r.err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}
