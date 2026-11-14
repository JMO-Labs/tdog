package term

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// fakeSession is a Session over an inert shell, never registered or pumped.
func fakeSession(exited bool) *Session {
	reg := NewRegistry(nil, 16)
	return &Session{
		id: "fake", started: time.Now(), reg: reg, ring: newRing(16), exited: exited,
		s: &session{w: io.Discard, resize: func(uint16, uint16) {}},
	}
}

func TestListSortsByIDWhenStartedEqual(t *testing.T) {
	reg := NewRegistry(nil, 16)
	now := time.Now()
	for _, id := range []string{"b", "c", "a"} {
		reg.sessions[id] = &Session{id: id, started: now, s: &session{}}
	}
	got := reg.List()
	if len(got) != 3 || got[0].ID != "a" || got[1].ID != "b" || got[2].ID != "c" {
		t.Fatalf("got %+v", got)
	}
}

func TestRingMarksFullOnExactWrap(t *testing.T) {
	g := newRing(4)
	g.write([]byte("ab"))
	g.write([]byte("cd")) // ends exactly at capacity: pos wraps to 0
	if !g.full {
		t.Fatal("ring should be full")
	}
	if got := string(g.snapshot()); got != "abcd" {
		t.Fatalf("got %q", got)
	}
	g.write([]byte("e"))
	if got := string(g.snapshot()); got != "bcde" {
		t.Fatalf("got %q", got)
	}
}

func TestAttachToExitedSessionReturnsNil(t *testing.T) {
	if a, replay := fakeSession(true).attach(); a != nil || replay != nil {
		t.Fatalf("got %v %q", a, replay)
	}
}

// serveVia runs s.serve on the server side of a fresh socket; pre runs on the
// server conn before serve. It returns the client conn.
func serveVia(t *testing.T, s *Session, pre func(*websocket.Conn)) (*websocket.Conn, context.Context) {
	t.Helper()
	c, ctx, _ := serveViaDone(t, s, pre)
	return c, ctx
}

// serveViaDone is serveVia plus a channel closed once the server handler
// (and so s.serve) has returned.
func serveViaDone(t *testing.T, s *Session, pre func(*websocket.Conn)) (*websocket.Conn, context.Context, <-chan struct{}) {
	t.Helper()
	done := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(done)
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		if pre != nil {
			pre(c)
		}
		s.serve(c)
	}))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	t.Cleanup(func() { <-done })
	return c, ctx, done
}

func TestServeExitedSessionClosesSocket(t *testing.T) {
	c, ctx := serveVia(t, fakeSession(true), nil)
	_, _, err := c.Read(ctx)
	if websocket.CloseStatus(err) != websocket.StatusNormalClosure || !strings.Contains(err.Error(), "session ended") {
		t.Fatalf("got %v", err)
	}
}

func TestServeReturnsWhenSessionControlWriteFails(t *testing.T) {
	s := fakeSession(false)
	_, _, done := serveViaDone(t, s, func(c *websocket.Conn) { _ = c.CloseNow() })
	select { // serve must return and detach before att is inspected
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("serve did not return")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.att != nil {
		t.Fatal("attachment should be cleared")
	}
}
