package term

import (
	"context"
	"sync"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/coder/websocket"
)

// Session is a registered shell plus its scrollback and current attachment.
type Session struct {
	id, scene, target string
	started           time.Time
	s                 *session
	reg               *Registry

	mu     sync.Mutex
	ring   *ring
	att    *attachment
	exited bool
}

// attachment is one socket's live view of a session.
type attachment struct {
	ch     chan []byte // live output; closed when the shell exits
	ctx    context.Context
	cancel context.CancelFunc
	reason string // why the server ended it (set before cancel)
}

func (s *Session) info() Info {
	s.mu.Lock()
	defer s.mu.Unlock()
	return Info{ID: s.id, Scene: s.scene, Target: s.target, PID: s.s.pid, Started: s.started, Attached: s.att != nil}
}

// pump copies shell output into the ring and the attachment until the shell ends.
func (s *Session) pump() {
	buf := make([]byte, flushSize)
	for {
		n, err := s.s.r.Read(buf)
		if n > 0 {
			s.feed(append([]byte(nil), buf[:n]...))
		}
		if err != nil {
			break
		}
	}
	<-s.s.wait.done
	s.mu.Lock()
	s.exited = true
	if s.att != nil {
		close(s.att.ch)
		s.att = nil
	}
	s.mu.Unlock()
	s.reg.remove(s.id)
	s.s.close()
	s.reg.audit.Log(audit.Entry{Event: "term_end", Target: s.target, PID: s.s.pid, Session: s.id})
}

// feed records b and forwards it to the attached socket. A client too slow to
// keep up is detached (it can reattach and replay) rather than blocking the shell.
func (s *Session) feed(b []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ring.write(b)
	if s.att == nil {
		return
	}
	select {
	case s.att.ch <- b:
	default:
		s.att.reason = "client too slow"
		s.att.cancel()
		s.att = nil
	}
}

// attach makes a new attachment current, replacing (and cancelling) any old
// one, and returns it with the scrollback to replay. nil if the shell exited.
func (s *Session) attach() (*attachment, []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.exited {
		return nil, nil
	}
	if old := s.att; old != nil {
		old.reason = "replaced by new attach"
		old.cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	a := &attachment{ch: make(chan []byte, 64), ctx: ctx, cancel: cancel}
	s.att = a
	return a, s.ring.snapshot()
}

func (s *Session) detach(a *attachment) {
	s.mu.Lock()
	if s.att == a {
		s.att = nil
	}
	s.mu.Unlock()
	a.cancel()
}

func (s *Session) auditEvent(ev string) {
	s.reg.audit.Log(audit.Entry{Event: ev, Target: s.target, PID: s.s.pid, Session: s.id})
}

// serve pumps frames between c and the session until the socket drops, is
// replaced, or the shell exits. The shell keeps running after a drop.
func (s *Session) serve(c *websocket.Conn) {
	a, replay := s.attach()
	if a == nil {
		_ = c.Close(websocket.StatusNormalClosure, "session ended")
		return
	}
	s.auditEvent("attach")
	defer s.auditEvent("detach")
	defer s.detach(a)
	// Socket I/O must not use a.ctx: cancelling a context mid-Read/Write makes
	// coder/websocket tear the connection down, so the close reason (e.g.
	// "replaced") would never reach the client. a.ctx only stops the output loop.
	ioctx, stop := context.WithCancel(context.Background())
	defer stop()
	write := func(f []byte) error { return c.Write(ioctx, websocket.MessageBinary, f) }

	go func() {
		defer a.cancel()
		pumpInput(ioctx, func(ctx context.Context) ([]byte, error) {
			_, data, err := c.Read(ioctx)
			return data, err
		}, s.s.w, s.s.resize, write)
	}()

	if write(frame.SessionControl(s.id)) != nil {
		return
	}
	for len(replay) > 0 {
		n := min(len(replay), flushSize)
		if write(frame.Encode(frame.Output, replay[:n])) != nil {
			return
		}
		replay = replay[n:]
	}

	if pumpOutput(a.ctx, write, a.ch) { // shell exited
		wctx, wcancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer wcancel()
		_ = c.Write(wctx, websocket.MessageBinary, frame.ExitControl(s.s.wait.code))
		_ = c.Close(websocket.StatusNormalClosure, "exit")
		return
	}
	s.mu.Lock()
	reason := a.reason
	s.mu.Unlock()
	if reason != "" {
		_ = c.Close(websocket.StatusPolicyViolation, reason)
	}
}
