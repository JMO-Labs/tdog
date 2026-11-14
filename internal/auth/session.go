package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

const idleTimeout = 12 * time.Hour

type session struct {
	csrf string
	last time.Time
}

type sessions struct {
	mu  sync.Mutex
	now func() time.Time
	m   map[string]*session
}

func newSessions() *sessions { return &sessions{now: time.Now, m: map[string]*session{}} }

func randToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand failure is unrecoverable
	}
	return hex.EncodeToString(b)
}

// create returns a new session id and its CSRF token.
func (s *sessions) create() (id, csrf string) {
	id, csrf = randToken(32), randToken(32)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[id] = &session{csrf: csrf, last: s.now()}
	return id, csrf
}

// touch returns the live session for id, refreshing its idle timer.
func (s *sessions) touch(id string) *session {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.m[id]
	if e == nil {
		return nil
	}
	if s.now().Sub(e.last) > idleTimeout {
		delete(s.m, id)
		return nil
	}
	e.last = s.now()
	return e
}

func (s *sessions) delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.m, id)
}

// clear drops every session.
func (s *sessions) clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	clear(s.m)
}
