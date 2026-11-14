package term

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/coder/websocket"
)

func TestAuditSessionStartEnd(t *testing.T) {
	l := audit.New(filepath.Join(t.TempDir(), "audit.log"))
	srv := httptest.NewServer(HandlerAudit("/bin/sh", l))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	send(t, ctx, c, frame.Input, "exit\n")
	deadline := time.Now().Add(10 * time.Second)
	for len(l.Recent(10)) < 2 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	got := l.Recent(10) // newest first
	if len(got) != 2 || got[0].Event != "term_end" || got[1].Event != "term_start" {
		t.Fatalf("entries = %+v", got)
	}
	if got[1].Target != "container" || got[1].PID <= 0 || got[0].PID != got[1].PID {
		t.Fatalf("entries = %+v", got)
	}
}
