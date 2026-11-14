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
	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/coder/websocket"
	"github.com/creack/pty"
)

const (
	flushAfter = 4 * time.Millisecond
	flushSize  = 16 * 1024
	hupGrace   = 2 * time.Second
)

// Config selects and parameterises the shell targets.
type Config struct {
	Shell string        // container target shell; "" means $SHELL, then /bin/sh
	SSH   SSHConfig     // ssh-host target
	Audit *audit.Logger // nil = off

	Registry   *Registry // shared session registry; nil = private one
	Scrollback int       // per-session scrollback bytes when Registry is nil; 0 = 1 MiB
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
	shell := cfg.Shell
	if shell == "" {
		shell = os.Getenv("SHELL")
	}
	if shell == "" {
		shell = "/bin/sh"
	}
	reg := cfg.Registry
	if reg == nil {
		reg = NewRegistry(cfg.Audit, cfg.Scrollback)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		target := q.Get("target")
		if target != "" && target != "ssh-host" && target != "container" {
			http.Error(w, "unknown target", http.StatusBadRequest)
			return
		}
		scene := q.Get("scene")
		if len(scene) > maxSceneLen {
			http.Error(w, "scene too long", http.StatusBadRequest)
			return
		}
		var existing *Session
		if id := q.Get("id"); id != "" {
			if existing = reg.get(id); existing == nil {
				http.Error(w, "unknown session", http.StatusNotFound)
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
			if target == "" {
				target = "container"
			}
			spawn := func() (*session, error) { return spawnPTY(shell) }
			if target == "ssh-host" {
				spawn = func() (*session, error) { return spawnSSH(cfg.SSH) }
			}
			s, err := spawn()
			if err != nil {
				if target == "ssh-host" {
					sshFail(c, err.Error())
				} else {
					_ = c.Close(websocket.StatusInternalError, err.Error())
				}
				return
			}
			sess = reg.add(target, scene, s)
		}
		sess.serve(c)
	})
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

func spawnPTY(shell string) (*session, error) {
	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
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
// reply (may be nil). Undecodable or unknown frames are skipped. It returns
// on a read error or a failed write.
func pumpInput(ctx context.Context, read func(context.Context) ([]byte, error), w io.Writer, resize func(cols, rows uint16), reply func([]byte) error) {
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
			}
		}
	}
}
