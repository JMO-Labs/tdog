// Package term serves a PTY-backed shell over a WebSocket (spec §4, §6 container target).
//
// TCP_NODELAY: Go enables it by default on accepted TCP connections and the
// hijacked connection keeps it. permessage-deflate is disabled explicitly.
package term

import (
	"context"
	"errors"
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

// Handler returns the /ws/term handler. shell "" means $SHELL, then /bin/sh.
// Callers must wrap it with authentication.
func Handler(shell string) http.Handler {
	if shell == "" {
		shell = os.Getenv("SHELL")
	}
	if shell == "" {
		shell = "/bin/sh"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			CompressionMode: websocket.CompressionDisabled,
		})
		if err != nil {
			return // Accept already replied (includes Origin check).
		}
		defer func() { _ = c.CloseNow() }()
		serve(c, shell)
	})
}

func serve(c *websocket.Conn, shell string) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		log.Printf("term: start %s: %v", shell, err)
		_ = c.Close(websocket.StatusInternalError, "pty start failed")
		return
	}
	defer func() { _ = ptmx.Close() }()

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

	// Client → PTY. On socket close, hang up the process group.
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
				if _, err := ptmx.Write(p); err != nil {
					return
				}
			case frame.Resize:
				if cols, rows, err := frame.ParseResize(p); err == nil {
					_ = pty.Setsize(ptmx, &pty.Winsize{Rows: rows, Cols: cols})
				}
			}
		}
	}()

	// PTY → chunks.
	chunks := make(chan []byte, 64)
	go func() {
		defer close(chunks)
		buf := make([]byte, flushSize)
		for {
			n, err := ptmx.Read(buf)
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

	if !exited { // socket went away first: SIGHUP the group (pty.Start sets Setsid, pgid == pid).
		_ = c.CloseNow()
		hangup(cmd.Process.Pid, waitCh)
		return
	}
	code := <-waitCh
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
