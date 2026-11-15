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
	events := func() map[string]audit.Entry {
		m := map[string]audit.Entry{}
		for _, e := range l.Recent(20) {
			m[e.Event] = e
		}
		return m
	}
	for len(events()) < 4 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	got := events()
	for _, ev := range []string{"term_start", "attach", "detach", "term_end"} {
		if _, ok := got[ev]; !ok {
			t.Fatalf("missing %s in %+v", ev, got)
		}
	}
	start, end := got["term_start"], got["term_end"]
	if start.Target != "container" || start.PID <= 0 || end.PID != start.PID || start.Session == "" || end.Session != start.Session {
		t.Fatalf("entries = %+v", got)
	}
}
