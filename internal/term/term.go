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
	Shell string    // container target shell; "" means $SHELL, then /bin/sh
	SSH   SSHConfig // ssh-host target
}

// Handler returns the /ws/term handler with SSH settings from the environment.
// Callers must wrap it with authentication.
func Handler(shell string) http.Handler {
	return NewHandler(Config{Shell: shell, SSH: SSHConfigFromEnv()})
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
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target := r.URL.Query().Get("target")
		if target != "" && target != "ssh-host" && target != "container" {
			http.Error(w, "unknown target", http.StatusBadRequest)
			return
		}
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			CompressionMode: websocket.CompressionDisabled,
		})
		if err != nil {
			return // Accept already replied (includes Origin check).
		}
		defer func() { _ = c.CloseNow() }()
		if target == "ssh-host" {
			serveSSH(c, cfg.SSH)
			return
		}
		serve(c, shell)
	})
}

// session is a running shell, whatever its target.
type session struct {
	r      io.Reader               // shell output
	w      io.Writer               // shell input
	resize func(cols, rows uint16) // window size change
	wait   <-chan int              // receives the exit code once
	kill   func()                  // hang up the shell (socket went away)
	close  func()                  // release resources
}

func serve(c *websocket.Conn, shell string) {
	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		log.Printf("term: start %s: %v", shell, err)
		_ = c.Close(websocket.StatusInternalError, "pty start failed")
		return
	}
	waitCh := make(chan int, 1)
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
		waitCh <- code
	}()
	runSession(c, &session{
		r: ptmx, w: ptmx,
		resize: func(cols, rows uint16) { _ = pty.Setsize(ptmx, &pty.Winsize{Rows: rows, Cols: cols}) },
		wait:   waitCh,
		// pty.Start sets Setsid, so pgid == pid.
		kill:  func() { hangup(cmd.Process.Pid, waitCh) },
		close: func() { _ = ptmx.Close() },
	})
}

// runSession pumps frames between the socket and s until either side ends.
func runSession(c *websocket.Conn, s *session) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer s.close()

	// Client → shell. On socket close, hang up the shell.
	go func() {
		defer cancel()
		for {
			_, data, err := c.Read(ctx)
			if err != nil {
				return
			}
			typ, p, err := frame.Decode(data)
			if err != nil {
				continue
			}
			switch typ {
			case frame.Input:
				if _, err := s.w.Write(p); err != nil {
					return
				}
			case frame.Resize:
				if cols, rows, err := frame.ParseResize(p); err == nil {
					s.resize(cols, rows)
				}
			}
		}
	}()

	// Shell → chunks.
	chunks := make(chan []byte, 64)
	go func() {
		defer close(chunks)
		buf := make([]byte, flushSize)
		for {
			n, err := s.r.Read(buf)
			if n > 0 {
				b := append([]byte(nil), buf[:n]...)
				select {
				case chunks <- b:
				case <-ctx.Done():
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	write := func(f []byte) error { return c.Write(ctx, websocket.MessageBinary, f) }
	exited := pumpOutput(ctx, write, chunks)

	if !exited { // socket went away first
		_ = c.CloseNow()
		s.kill()
		return
	}
	code := <-s.wait
	wctx, wcancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer wcancel()
	_ = c.Write(wctx, websocket.MessageBinary, frame.ExitControl(code))
	_ = c.Close(websocket.StatusNormalClosure, "exit")
}

// hangup sends SIGHUP to the process group and escalates to SIGKILL if it
// has not exited within hupGrace (e.g. a shell or child ignoring SIGHUP).
func hangup(pid int, waitCh <-chan int) {
	_ = syscall.Kill(-pid, syscall.SIGHUP)
	select {
	case <-waitCh:
	case <-time.After(hupGrace):
		_ = syscall.Kill(-pid, syscall.SIGKILL)
		<-waitCh
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
