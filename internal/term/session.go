package term

import (
	"context"
	"io"
	"sync"
	"sync/atomic"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/JMO-Labs/tdog/internal/journal"
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
	killed bool // ended by a kill request; clients get a "killed" control

	// Parking (park.go): s may be swapped while parked; read it via tr().
	parked  bool          // transport closed on purpose; tmux keeps the shell
	hungUp  bool          // a kill was requested: a parked pump must end
	cond    *sync.Cond    // on mu; wakes a parked pump
	parkMu  sync.Mutex    // serializes park against unpark+attach
	parkRec uint64        // gap rec of the current park; guarded by parkMu
	ended   chan struct{} // closed when pump ends

	pane string // browser pane key for journal sync; "" = never syncs; set once

	onClose func() // preset on_close hook; nil when none
	j       *jrnl  // session journal; nil when absent

	// Pane pipe (pipe.go): while pipeFeed is set, only the pipe feeds the
	// journal. pipeFeed is written under mu, read anywhere.
	pipe     io.ReadCloser // live pipe; guarded by mu
	pipeDone chan struct{} // closed when the live pipe's reader exits; guarded by mu
	pipeFeed atomic.Bool
	fellBack bool // pipe gave up for good (journal fed from the PTY); guarded by mu
}

// attachment is one socket's live view of a session.
type attachment struct {
	ch     chan []byte // live output; closed when the shell exits
	ctx    context.Context
	cancel context.CancelFunc
	reason string // why the server ended it (set before cancel)
}

// paneID returns the pane key ("" when none was given).
func (s *Session) paneID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pane
}

// setPane records the pane key unless one is already set or p is not a safe
// id: the first valid pane wins, so a later attach cannot retarget the files.
func (s *Session) setPane(p string) {
	if !journal.ValidPane(p) {
		return
	}
	s.mu.Lock()
	if s.pane == "" {
		s.pane = p
	}
	s.mu.Unlock()
}

// dropSynced deletes the pane's synced journal files (a user kill or close)
// and keeps later acks from recreating them.
func (s *Session) dropSynced() { s.j.kill() }

func (s *Session) info() Info {
	s.mu.Lock()
	defer s.mu.Unlock()
	return Info{ID: s.id, Scene: s.scene, Target: s.target, PID: s.s.pid, Started: s.started, Attached: s.att != nil}
}

// pump copies shell output into the ring and the attachment until the shell
// ends. A parked transport's end is not the shell's: pump waits in next for
// the replacement transport and carries on reading from it.
func (s *Session) pump() {
	buf := make([]byte, flushSize)
	t := s.tr()
	for t != nil {
		for {
			n, err := t.r.Read(buf)
			if n > 0 {
				s.feed(append([]byte(nil), buf[:n]...))
			}
			if err != nil {
				break
			}
		}
		<-t.wait.done
		if nt := s.next(t); nt != nil {
			t = nt
			continue
		}
		break
	}
	if s.ended != nil {
		close(s.ended)
	}
	s.j.stop()
	s.mu.Lock()
	s.exited = true
	if s.att != nil {
		close(s.att.ch)
		s.att = nil
	}
	s.mu.Unlock()
	waitPipe := s.dropPipe() // after exited: no pipe can open from here on
	t = s.tr()
	t.close()
	waitPipe()
	// Log before removal: once the session is gone from the registry, its end is on record.
	s.reg.audit.Log(audit.Entry{Event: "term_end", Target: s.target, PID: t.pid, Session: s.id})
	s.reg.remove(s.id)
	if s.onClose != nil {
		go s.onClose()
	}
}

// feed records b and forwards it to the attached socket. A client too slow to
// keep up is detached (it can reattach and replay) rather than blocking the shell.
func (s *Session) feed(b []byte) {
	// Parsing and encryption run outside s.mu so they never block attach/info.
	// pump is the only PTY feeder, so journal order matches output order.
	// With a live pane pipe the pipe feeds the journal instead (pipe.go).
	if !s.pipeFeed.Load() {
		s.j.feed(b)
	}
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
	s.reg.audit.Log(audit.Entry{Event: ev, Target: s.target, PID: s.tr().pid, Session: s.id})
}

// serve pumps frames between c and the session until the socket drops, is
// replaced, or the shell exits. The shell keeps running after a drop.
func (s *Session) serve(c *websocket.Conn) {
	a, replay, err := s.attachUnparked()
	if err != nil {
		sshFail(c, "reconnect to host failed: "+err.Error())
		return
	}
	if a == nil {
		_ = c.Close(websocket.StatusNormalClosure, "session ended")
		return
	}
	s.auditEvent("attach")
	// LIFO: "detach" is logged before the attachment clears (see detach).
	defer s.detach(a)
	defer s.auditEvent("detach")
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
		}, trWriter{s}, func(cols, rows uint16) { s.tr().resize(cols, rows) }, write, func(p []byte) { s.j.control(p, write) })
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
	if write(frame.ReplayedControl()) != nil {
		return
	}

	go s.j.stream(a.ctx, write)
	if pumpOutput(a.ctx, write, a.ch) { // shell exited
		wctx, wcancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer wcancel()
		s.mu.Lock()
		killed := s.killed
		s.mu.Unlock()
		if killed {
			_ = c.Write(wctx, websocket.MessageBinary, frame.KilledControl())
		}
		_ = c.Write(wctx, websocket.MessageBinary, frame.ExitControl(s.tr().wait.code))
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
