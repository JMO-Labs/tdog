package term

import (
	"errors"
	"fmt"
	"log"
	"net"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
)

const (
	tmuxPrefix   = "tdog-"
	historyLimit = 50000 // tmux scrollback lines, so a restore can reach a park
)

// CmdRunner runs a command on the ssh host and returns its stdout.
type CmdRunner func(cmd string) (string, error)

// idRe bounds ids taken from the host before they reach a shell command line.
var idRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func tmuxAttachCmd(id string) string { return "tmux new -A -s " + tmuxPrefix + id }

func killTmux(run CmdRunner, id string) error {
	_, err := run("tmux kill-session -t " + tmuxPrefix + id)
	return err
}

// listTmux returns the ids of the host's tdog-* tmux sessions. No tmux server
// (non-zero exit) means none.
func listTmux(run CmdRunner) ([]string, error) {
	out, err := run("tmux list-sessions -F '#{session_name}'")
	var ee *ssh.ExitError
	if errors.As(err, &ee) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, line := range strings.Split(out, "\n") {
		id, ok := strings.CutPrefix(strings.TrimSpace(line), tmuxPrefix)
		if ok && idRe.MatchString(id) {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// sshRunner runs each command in its own ssh connection.
func sshRunner(cfg SSHConfig) CmdRunner {
	return func(cmd string) (string, error) {
		client, err := dialSSH(cfg)
		if err != nil {
			return "", err
		}
		defer func() { _ = client.Close() }()
		sess, err := client.NewSession()
		if err != nil {
			return "", err
		}
		defer func() { _ = sess.Close() }()
		out, err := sess.Output(cmd)
		return string(out), err
	}
}

// wrapTmuxKill makes s.kill end the host tmux session too.
func wrapTmuxKill(s *session, run CmdRunner, id string) {
	orig := s.kill
	s.kill = func() {
		if err := killTmux(run, id); err != nil {
			log.Printf("term: tmux kill %s: %v", id, err)
		}
		orig()
	}
}

// spawnTmux attaches to (creating if needed) the host tmux session for id.
func spawnTmux(cfg SSHConfig, run CmdRunner, id string) (*session, error) {
	return spawnTmuxCmd(cfg, run, id, tmuxAttachCmd(id))
}

// spawnTmuxCmd is spawnTmux with an explicit attach command (cwd/env setup).
// The session can park: closing ssh leaves the tmux shell running, and
// unpark re-runs cmd, whose "new -A" re-attaches to it.
func spawnTmuxCmd(cfg SSHConfig, run CmdRunner, id, cmd string) (*session, error) {
	s, err := spawnSSHCmd(cfg, cmd)
	if err != nil {
		return nil, err
	}
	wrapTmuxKill(s, run, id)
	s.park = func() error { s.close(); return nil }
	s.unpark = func() (*session, error) { return spawnTmuxCmd(cfg, run, id, cmd) }
	s.snap = func() (string, error) { return capture(run, id) }
	raiseHistoryOnce(net.JoinHostPort(cfg.Host, cfg.Port), run)
	return s, nil
}

// capture returns session id's tmux scrollback as plain text, wrapped lines joined.
func capture(run CmdRunner, id string) (string, error) {
	return run("tmux capture-pane -p -J -S -" + strconv.Itoa(historyLimit) + " -t " + tmuxPrefix + id)
}

// raiseHistory lifts the host's global tmux history-limit to historyLimit
// (never lowers it). It applies to panes created afterwards.
func raiseHistory(run CmdRunner) error {
	out, err := run("tmux show -gv history-limit")
	if err != nil {
		return err
	}
	if n, err := strconv.Atoi(strings.TrimSpace(out)); err == nil && n >= historyLimit {
		return nil
	}
	_, err = run("tmux set -g history-limit " + strconv.Itoa(historyLimit))
	return err
}

var raisedHosts sync.Map // host:port -> true once raiseHistory was tried

// raiseHistoryOnce runs raiseHistory in the background, once per host per
// process; failures are logged and never fail a spawn.
func raiseHistoryOnce(host string, run CmdRunner) {
	if _, done := raisedHosts.LoadOrStore(host, true); done {
		return
	}
	go func() {
		if err := raiseHistory(run); err != nil {
			log.Printf("term: tmux history-limit on %s: %v", host, err)
		}
	}()
}

// Rediscover registers an attached session for every host tdog-* tmux session
// the registry does not know yet and returns how many it added.
func (r *Registry) Rediscover(run CmdRunner, spawn func(id string) (*session, error)) (int, error) {
	ids, err := listTmux(run)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, id := range ids {
		if r.get(id) != nil {
			continue
		}
		s, err := spawn(id)
		if err != nil {
			return n, fmt.Errorf("reattach %s: %w", id, err)
		}
		r.addID(id, "ssh-host", "", s)
		n++
	}
	return n, nil
}

// RediscoverSSH is Rediscover against the ssh-host target.
func (r *Registry) RediscoverSSH(cfg SSHConfig) (int, error) {
	run := sshRunner(cfg)
	return r.Rediscover(run, func(id string) (*session, error) { return spawnTmux(cfg, run, id) })
}
