package term

import (
	"errors"
	"io"
	"log"
	"os"
	"time"
)

// Parking: a tmux-backed ssh session idle at a prompt with no browser for
// parkAfter has its ssh connection closed; the host tmux keeps the shell. The
// next attach re-dials (unpark) and pump carries on with the new transport.
//
// State (all under Session.mu): s is the current transport, parked says it
// was closed on purpose, hungUp says a kill was requested (or the host tmux
// session is gone). pump reads s until
// it ends, then calls next: if s was swapped meanwhile it continues with the
// new one; if parked and not hung up it waits on cond; otherwise the shell
// ended. parkMu serializes park against unpark+attach so a browser can never
// attach to a transport that is being parked.

const parkTick = 30 * time.Second

// parkAfter is the idle time before parking (TDOG_PARK_AFTER, read once).
var parkAfter = parkAfterEnv(os.Getenv)

func parkAfterEnv(get func(string) string) time.Duration {
	if d, err := time.ParseDuration(get("TDOG_PARK_AFTER")); err == nil && d > 0 {
		return d
	}
	return 5 * time.Minute
}

func (r *Registry) ticker() (<-chan time.Time, func()) {
	if r.parkTicker != nil {
		return r.parkTicker()
	}
	t := time.NewTicker(parkTick)
	return t.C, t.Stop
}

// tr is the current transport.
func (s *Session) tr() *session {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.s
}

// trWriter writes input to whichever transport is current.
type trWriter struct{ s *Session }

func (w trWriter) Write(p []byte) (int, error) { return w.s.tr().w.Write(p) }

var _ io.Writer = trWriter{}

// next is called by pump once transport t has ended. It returns the
// transport to read next, or nil when the shell itself ended.
func (s *Session) next(t *session) *session {
	s.mu.Lock()
	defer s.mu.Unlock()
	for s.s == t && s.parked && !s.hungUp {
		s.cond.Wait()
	}
	if s.s != t {
		return s.s
	}
	return nil
}

// hangUp records a kill request and wakes a parked pump so it can end.
func (s *Session) hangUp() {
	s.mu.Lock()
	s.hungUp = true
	if s.cond != nil {
		s.cond.Broadcast()
	}
	s.mu.Unlock()
}

// idleLoop checks for parking on every tick until the session ends.
func (s *Session) idleLoop(tick <-chan time.Time, stop func()) {
	defer stop()
	for {
		select {
		case <-s.ended:
			return
		case now := <-tick:
			s.j.expireCaps(now)
			s.tryPark(now)
		}
	}
}

// tryPark parks the session if no browser is attached and the shell has sat
// at a prompt with no output for parkAfter as of now.
func (s *Session) tryPark(now time.Time) bool {
	s.parkMu.Lock()
	defer s.parkMu.Unlock()
	// j.idle runs outside s.mu: the journal takes s.mu under its own lock.
	if !s.j.idle(now, parkAfter) {
		return false
	}
	s.mu.Lock()
	t := s.s
	ok := t.link != nil && !s.parked && !s.exited && !s.hungUp && s.att == nil
	s.parked = ok // set before closing: pump must see the end as a park
	s.mu.Unlock()
	if !ok {
		return false
	}
	pos, err := t.link.position() // best effort: restore falls back to the anchor
	if err != nil {
		log.Printf("term: park %s: position: %v", s.id, err)
		pos = -1
	}
	s.closePipe() // before the transport: the pipe channel rides on it
	t.close()     // drops ssh only; the host tmux keeps the shell
	s.parkRec = s.j.parkGap(pos)
	s.auditEvent("park")
	return true
}

// unparkLocked re-dials a parked session (a no-op otherwise); callers hold
// parkMu. A tmux session that is gone ends the session like a shell exit
// instead of starting a fresh shell. The scrollback is captured before the
// re-dial, so a restore never repeats output journaled after it.
func (s *Session) unparkLocked() error {
	s.mu.Lock()
	old, parked, gone := s.s, s.parked, s.hungUp
	s.mu.Unlock()
	if !parked || gone {
		return nil
	}
	alive, err := old.link.alive()
	if err != nil {
		return err
	}
	if !alive {
		s.hangUp() // pump ends the session normally
		return nil
	}
	scr, cerr := old.link.capture()
	s.j.storeCapture(s.parkRec, scr, cerr, time.Now())
	ns, err := old.link.redial()
	if err != nil {
		return err
	}
	s.mu.Lock()
	if s.hungUp { // killed while dialling: the new attach must not outlive it
		s.mu.Unlock()
		go ns.kill()
		return errors.New("session ended")
	}
	s.s, s.parked = ns, false
	s.cond.Broadcast()
	s.mu.Unlock()
	s.startPipe(ns) // the old pipe died with the old client
	s.auditEvent("unpark")
	return nil
}

// attachUnparked unparks the session if needed, then attaches. On an unpark
// error the session stays parked and nothing is attached.
func (s *Session) attachUnparked() (*attachment, []byte, error) {
	s.parkMu.Lock()
	defer s.parkMu.Unlock()
	if err := s.unparkLocked(); err != nil {
		return nil, nil, err
	}
	a, replay := s.attach()
	return a, replay, nil
}
