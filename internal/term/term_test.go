package term

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
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
