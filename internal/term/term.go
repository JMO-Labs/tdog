// Package term serves a PTY-backed shell over a WebSocket (spec §4, §6 container target).
//
// TCP_NODELAY: Go enables it by default on accepted TCP connections and the
// hijacked connection keeps it. permessage-deflate is disabled explicitly.
package term

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"syscall"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/config"
	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/coder/websocket"
	"github.com/creack/pty"
)

const (
	flushAfter = 4 * time.Millisecond
	flushSize  = 16 * 1024
	hupGrace   = 3 * time.Second

	journalCap = 16 << 20 // per-session journal buffer bytes
)

// Config selects and parameterises the shell targets.
type Config struct {
	Shell string        // container target shell; "" means $SHELL, bash, then /bin/sh
	SSH   SSHConfig     // ssh-host target
	Audit *audit.Logger // nil = off

	Presets    *config.Store // preset store for ?preset=; nil = presets off
	Registry   *Registry     // shared session registry; nil = private one
	Scrollback int           // per-session scrollback bytes when Registry is nil; 0 = 1 MiB
}

// Handler returns the /ws/term handler with SSH settings from the environment.
// Callers must wrap it with authentication.
func Handler(shell string) http.Handler { return HandlerAudit(shell, nil) }

// HandlerAudit is Handler that records term_start/term_end in l (nil = off).
func HandlerAudit(shell string, l *audit.Logger) http.Handler {
	return NewHandler(Config{Shell: shell, SSH: SSHConfigFromEnv(), Audit: l})
}

// NewHandler serves /ws/term; ?target=ssh-host|container picks the target
// (default container). Callers must wrap it with authentication.
func NewHandler(cfg Config) http.Handler {
	l := newLauncher(cfg)
	reg := l.reg
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		target := q.Get("target")
		persistent := q.Get("persistent") == "1"
		if msg := checkTarget(target, persistent); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		scene := q.Get("scene")
		if len(scene) > maxSceneLen {
			http.Error(w, "scene too long", http.StatusBadRequest)
			return
		}
		pane := q.Get("pane")
		var existing *Session
		if id := q.Get("id"); id != "" {
			if existing = reg.get(id); existing == nil {
				http.Error(w, "unknown session", http.StatusNotFound)
				return
			}
		}
		spec, line := Spec{Target: target, Persistent: persistent}, ""
		if name := q.Get("preset"); name != "" && existing == nil {
			var err error
			if spec, err = loadSpec(cfg.Presets, name, q.Get("override")); err == nil {
				if msg := checkTarget(spec.Target, spec.Persistent); msg != "" {
					err = errors.New(msg)
				}
			}
			if err == nil {
				line, err = BuildLine(spec.Pre, spec.Command, spec.Post)
			}
			if err != nil {
				code := http.StatusBadRequest
				if errors.Is(err, config.ErrNotFound) {
					code = http.StatusNotFound
				}
				http.Error(w, err.Error(), code)
				return
			}
		}
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			CompressionMode: websocket.CompressionDisabled,
		})
		if err != nil {
			return // Accept already replied (includes Origin check).
		}
		defer func() { _ = c.CloseNow() }()
		sess := existing
		if sess == nil {
			var err error
			if sess, err = l.start(scene, spec, line); err != nil {
				if spec.Target == "ssh-host" {
					sshFail(c, err.Error())
				} else {
					_ = c.Close(websocket.StatusInternalError, err.Error())
				}
				return
			}
		}
		sess.setPane(pane)
		sess.serve(c)
	})
}

// launcher starts shells for the handler and for scene starts.
type launcher struct {
	shell string
	ssh   SSHConfig
	run   CmdRunner
	reg   *Registry
}

func newLauncher(cfg Config) *launcher {
	shell := pickShell(cfg.Shell, os.Getenv("SHELL"), lookPath)
	reg := cfg.Registry
	if reg == nil {
		reg = NewRegistry(cfg.Audit, cfg.Scrollback)
	}
	return &launcher{shell: shell, ssh: cfg.SSH, run: sshRunner(cfg.SSH), reg: reg}
}

// start spawns sp's shell, types line into it and registers it under scene.
func (l *launcher) start(scene string, sp Spec, line string) (*Session, error) {
	target := sp.Target
	if target == "" {
		target = "container"
	}
	id := newID()
	spawn := func() (*session, error) { return spawnPTYIn(l.shell, expandHome(sp.Cwd), sp.Env) }
	if target == "ssh-host" {
		spawn = func() (*session, error) { return spawnSSHCmd(l.ssh, sp.shellCmd()) }
		if sp.Persistent {
			spawn = func() (*session, error) { return spawnTmuxCmd(l.ssh, l.run, id, sp.tmuxCmd(id)) }
		}
	}
	s, err := spawn()
	if err != nil {
		return nil, err
	}
	if line != "" { // typed like a keyboard would; the pty buffers it until the shell reads
		_, _ = s.w.Write([]byte(line + "\r"))
	}
	return l.reg.add(id, target, scene, s, l.reg.onCloseFn(sp, l.shell, l.ssh, id, target)), nil
}

// session is a running shell, whatever its target.
type session struct {
	r      io.Reader               // shell output
	w      io.Writer               // shell input
	resize func(cols, rows uint16) // window size change
	wait   *waiter                 // exit state
	kill   func()                  // hang up the shell; returns once it exited
	close  func()                  // release resources
	pid    int                     // 0 when unknown (ssh)

	link *tmuxLink // tmux-backed ssh only: the session can park (park.go)

	// openPipe opens a second channel streaming the raw pane bytes (pipe.go);
	// nil when the transport has none.
	openPipe func() (io.ReadCloser, error)
}

// waiter publishes a process exit: done closes after code is set.
type waiter struct {
	done chan struct{}
	code int
}

func newWaiter() *waiter { return &waiter{done: make(chan struct{})} }

func (w *waiter) finish(code int) {
	w.code = code
	close(w.done)
}

// checkTarget returns why (target, persistent) is invalid, or "".
func checkTarget(target string, persistent bool) string {
	switch {
	case persistent && target != "ssh-host":
		return "persistent requires the ssh-host target"
	case target != "" && target != "ssh-host" && target != "container":
		return "unknown target"
	}
	return ""
}

// spawnPTYIn starts shell in dir ("" = inherit) with env added. Preset env
// is applied after the bash prompt cleanup, so an explicit PS1 still wins.
func spawnPTYIn(shell, dir string, env map[string]string) (*session, error) {
	cmd := exec.Command(shell, shellArgs(shell)...)
	cmd.Dir = dir
	cmd.Env = shellEnv(shell, os.Environ())
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		log.Printf("term: start %s: %v", shell, err)
		return nil, errors.New("pty start failed")
	}
	w := newWaiter()
	go func() {
		err := cmd.Wait()
		code := 0
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			code = ee.ExitCode()
			if code < 0 { // killed by signal
				code = 128 + int(ee.Sys().(syscall.WaitStatus).Signal())
			}
		}
		w.finish(code)
	}()
	pid := cmd.Process.Pid
	return &session{
		r: ptmx, w: ptmx, pid: pid, wait: w,
		resize: func(cols, rows uint16) { _ = pty.Setsize(ptmx, &pty.Winsize{Rows: rows, Cols: cols}) },
		// pty.Start sets Setsid, so pgid == pid.
		kill:  func() { hangup(pid, w.done) },
		close: func() { _ = ptmx.Close() },
	}, nil
}

// hangup sends SIGHUP to the process group and escalates to SIGKILL if it
// has not exited within hupGrace (e.g. a shell or child ignoring SIGHUP).
func hangup(pid int, done <-chan struct{}) {
	_ = syscall.Kill(-pid, syscall.SIGHUP)
	select {
	case <-done:
	case <-time.After(hupGrace):
		_ = syscall.Kill(-pid, syscall.SIGKILL)
		<-done
	}
}

// pumpOutput coalesces chunks into ≤flushSize frames, flushing after flushAfter.
// It returns true if the PTY closed (process exit), false if ctx ended or a write failed.
func pumpOutput(ctx context.Context, write func(frame []byte) error, chunks <-chan []byte) bool {
	var pend []byte
	var timer <-chan time.Time
	flush := func() bool {
		for len(pend) > 0 {
			n := min(len(pend), flushSize)
			if err := write(frame.Encode(frame.Output, pend[:n])); err != nil {
				return false
			}
			pend = pend[n:]
		}
		pend, timer = nil, nil
		return true
	}
	for {
		select {
		case b, ok := <-chunks:
			if !ok {
				flush()
				return true
			}
			pend = append(pend, b...)
			if len(pend) >= flushSize {
				if !flush() {
					return false
				}
			} else if timer == nil {
				timer = time.After(flushAfter)
			}
		case <-timer:
			if !flush() {
				return false
			}
		case <-ctx.Done():
			return false
		}
	}
}

// pumpInput decodes client frames and applies them: Input is written to w,
// Resize calls resize, and a ping control frame is answered with a pong via
// reply (may be nil); other control payloads go to ctl (may be nil). Undecodable or unknown frames are skipped. It returns
// on a read error or a failed write.
func pumpInput(ctx context.Context, read func(context.Context) ([]byte, error), w io.Writer, resize func(cols, rows uint16), reply func([]byte) error, ctl func([]byte)) {
	for {
		data, err := read(ctx)
		if err != nil {
			return
		}
		typ, p, err := frame.Decode(data)
		if err != nil {
			continue
		}
		switch typ {
		case frame.Input:
			if _, err := w.Write(p); err != nil {
				return
			}
		case frame.Resize:
			if cols, rows, err := frame.ParseResize(p); err == nil && resize != nil {
				resize(cols, rows)
			}
		case frame.Control:
			if pong, ok := frame.Pong(p); ok && reply != nil {
				_ = reply(pong)
			} else if ctl != nil {
				ctl(p)
			}
		}
	}
}
