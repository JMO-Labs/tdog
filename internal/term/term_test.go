package term

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/coder/websocket"
)

func dial(t *testing.T) (*websocket.Conn, context.Context) {
	t.Helper()
	srv := httptest.NewServer(Handler("/bin/sh"))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	url := "ws" + strings.TrimPrefix(srv.URL, "http")
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c, ctx
}

func send(t *testing.T, ctx context.Context, c *websocket.Conn, typ frame.Type, p string) {
	t.Helper()
	if err := c.Write(ctx, websocket.MessageBinary, frame.Encode(typ, []byte(p))); err != nil {
		t.Fatal(err)
	}
}

// readUntil collects output until it contains want; returns a control payload if seen first.
func readUntil(t *testing.T, ctx context.Context, c *websocket.Conn, want string) (string, []byte) {
	t.Helper()
	var out strings.Builder
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			t.Fatalf("read: %v (output so far %q)", err, out.String())
		}
		typ, p, err := frame.Decode(data)
		if err != nil {
			t.Fatal(err)
		}
		switch typ {
		case frame.Output:
			out.Write(p)
			if want != "" && strings.Contains(out.String(), want) {
				return out.String(), nil
			}
		case frame.Control:
			return out.String(), p
		}
	}
}

func TestEchoThroughSocket(t *testing.T) {
	c, ctx := dial(t)
	// Arithmetic so the typed command echo can't match the expected result.
	send(t, ctx, c, frame.Input, "echo $((20+22))\n")
	out, _ := readUntil(t, ctx, c, "42")
	if !strings.Contains(out, "42") {
		t.Fatalf("got %q", out)
	}
}

func TestResizeApplied(t *testing.T) {
	c, ctx := dial(t)
	send(t, ctx, c, frame.Resize, `{"cols":123,"rows":45}`)
	send(t, ctx, c, frame.Input, "stty size\n")
	out, _ := readUntil(t, ctx, c, "45 123")
	if !strings.Contains(out, "45 123") {
		t.Fatalf("got %q", out)
	}
}

func TestExitSendsControlWithCode(t *testing.T) {
	c, ctx := dial(t)
	send(t, ctx, c, frame.Input, "exit 3\n")
	_, ctl := readUntil(t, ctx, c, "")
	var v struct {
		Type string `json:"type"`
		Code int    `json:"code"`
	}
	if err := json.Unmarshal(ctl, &v); err != nil {
		t.Fatalf("control %q: %v", ctl, err)
	}
	if v.Type != "exit" || v.Code != 3 {
		t.Fatalf("got %+v", v)
	}
}

func waitFile(t *testing.T, path string, d time.Duration) []byte {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if b, err := os.ReadFile(path); err == nil && len(b) > 0 {
			return b
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("%s not written within %v", path, d)
	return nil
}

func TestSocketCloseSendsSIGHUP(t *testing.T) {
	c, ctx := dial(t)
	f := filepath.Join(t.TempDir(), "hup")
	send(t, ctx, c, frame.Input, "trap 'echo hup > "+f+"; exit' HUP; echo re\"\"ady; while :; do sleep 0.1; done\n")
	readUntil(t, ctx, c, "ready")
	_ = c.CloseNow()
	if b := waitFile(t, f, 5*time.Second); !strings.Contains(string(b), "hup") {
		t.Fatalf("got %q", b)
	}
}

func TestSocketCloseKillsHUPIgnoringGroup(t *testing.T) {
	c, ctx := dial(t)
	f := filepath.Join(t.TempDir(), "pid")
	send(t, ctx, c, frame.Input, "trap '' HUP; echo $$ > "+f+"; echo re\"\"ady; while :; do sleep 0.1; done\n")
	readUntil(t, ctx, c, "ready")
	pid, err := strconv.Atoi(strings.TrimSpace(string(waitFile(t, f, 5*time.Second))))
	if err != nil {
		t.Fatal(err)
	}
	_ = c.CloseNow()
	deadline := time.Now().Add(hupGrace + 5*time.Second)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(pid, 0); errors.Is(err, syscall.ESRCH) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("pid %d still alive after SIGHUP grace", pid)
}

func dialHandler(t *testing.T, shell string) (*websocket.Conn, context.Context) {
	t.Helper()
	srv := httptest.NewServer(Handler(shell))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c, ctx
}

func TestHandlerUsesSHELLEnv(t *testing.T) {
	t.Setenv("SHELL", "/bin/sh")
	c, ctx := dialHandler(t, "")
	send(t, ctx, c, frame.Input, "echo $((20+22))\n")
	if out, _ := readUntil(t, ctx, c, "42"); !strings.Contains(out, "42") {
		t.Fatalf("got %q", out)
	}
}

func TestHandlerFallsBackToBinSh(t *testing.T) {
	t.Setenv("SHELL", "")
	c, ctx := dialHandler(t, "")
	send(t, ctx, c, frame.Input, "echo $((20+22))\n")
	if out, _ := readUntil(t, ctx, c, "42"); !strings.Contains(out, "42") {
		t.Fatalf("got %q", out)
	}
}

func TestNonUpgradeRequestRejected(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler("/bin/sh").ServeHTTP(rec, httptest.NewRequest("GET", "/ws/term", nil))
	if rec.Code < 400 {
		t.Fatalf("got status %d, want 4xx", rec.Code)
	}
}

func TestPTYStartFailureClosesSocket(t *testing.T) {
	c, ctx := dialHandler(t, "/nonexistent/tdog-shell")
	_, _, err := c.Read(ctx)
	if websocket.CloseStatus(err) != websocket.StatusInternalError {
		t.Fatalf("got %v, want internal error close", err)
	}
}

func TestMalformedFrameIgnored(t *testing.T) {
	c, ctx := dial(t)
	if err := c.Write(ctx, websocket.MessageBinary, nil); err != nil {
		t.Fatal(err)
	}
	send(t, ctx, c, frame.Input, "echo $((20+22))\n")
	if out, _ := readUntil(t, ctx, c, "42"); !strings.Contains(out, "42") {
		t.Fatalf("got %q", out)
	}
}

// Input after the shell exited must not wedge the handler (PTY write error path).
func TestInputAfterExitDoesNotHang(t *testing.T) {
	c, ctx := dial(t)
	send(t, ctx, c, frame.Input, "exit 0\n")
	for i := 0; i < 20; i++ {
		if err := c.Write(ctx, websocket.MessageBinary, frame.Encode(frame.Input, []byte("x\n"))); err != nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	readUntil(t, ctx, c, "")
}

// Closing the socket while the shell floods output exercises the reader's ctx.Done exit.
func TestCloseDuringOutputFlood(t *testing.T) {
	c, ctx := dial(t)
	f := filepath.Join(t.TempDir(), "pid")
	send(t, ctx, c, frame.Input, "echo $$ > "+f+"; yes\n")
	pid, err := strconv.Atoi(strings.TrimSpace(string(waitFile(t, f, 5*time.Second))))
	if err != nil {
		t.Fatal(err)
	}
	// Wait for the first flood frame only, then stop reading so the server
	// stays blocked writing to a slow client (backpressure) when we close.
	if _, _, err := c.Read(ctx); err != nil {
		t.Fatal(err)
	}
	_ = c.CloseNow()
	deadline := time.Now().Add(hupGrace + 10*time.Second)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(pid, 0); errors.Is(err, syscall.ESRCH) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("pid %d still alive", pid)
}
