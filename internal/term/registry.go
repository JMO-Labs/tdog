package term

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/journal"
)

const (
	defaultScrollback = 1 << 20 // 1 MiB
	maxSceneLen       = 64
)

// Info is the public view of a session (GET /api/sessions).
type Info struct {
	ID       string    `json:"id"`
	Scene    string    `json:"scene"`
	Target   string    `json:"target"`
	PID      int       `json:"pid"`
	Started  time.Time `json:"started"`
	Attached bool      `json:"attached"`
}

// Registry holds shells that outlive their WebSocket (spec §6 Persistence).
// It is safe for concurrent use.
type Registry struct {
	mu         sync.Mutex
	sessions   map[string]*Session
	scrollback int
	audit      *audit.Logger
	jstore     *journal.Store // optional server journal sync; nil = off

	parkTicker func() (<-chan time.Time, func()) // test seam; nil = every parkTick
}

func (r *Registry) store() *journal.Store {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.jstore
}

// SetJournalStore enables server-side journal sync for sessions created after
// the call (nil = off).
func (r *Registry) SetJournalStore(s *journal.Store) {
	r.mu.Lock()
	r.jstore = s
	r.mu.Unlock()
}

// NewRegistry returns an empty registry; scrollback is the per-session ring
// size in bytes (<=0 means 1 MiB). l may be nil.
func NewRegistry(l *audit.Logger, scrollback int) *Registry {
	if scrollback <= 0 {
		scrollback = defaultScrollback
	}
	return &Registry{sessions: map[string]*Session{}, scrollback: scrollback, audit: l}
}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:]) // never fails on supported platforms
	return hex.EncodeToString(b[:])
}

func (r *Registry) get(id string) *Session {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.sessions[id]
}

func (r *Registry) remove(id string) {
	r.mu.Lock()
	delete(r.sessions, id)
	r.mu.Unlock()
}

// addID registers a running shell and starts pumping its output.
func (r *Registry) addID(id, target, scene string, s *session) *Session {
	return r.add(id, target, scene, s, nil)
}

// add is addID with an optional on_close hook run after the shell ends.
func (r *Registry) add(id, target, scene string, s *session, onClose func()) *Session {
	sess := &Session{
		id: id, scene: scene, target: target, started: time.Now().UTC(),
		s: s, reg: r, ring: newRing(r.scrollback), onClose: onClose, j: newJrnl(),
		ended: make(chan struct{}),
	}
	sess.cond = sync.NewCond(&sess.mu)
	r.mu.Lock()
	sess.j.store, sess.j.sid, sess.j.pane = r.jstore, id+"."+sess.j.epoch, sess.paneID
	r.sessions[sess.id] = sess
	r.mu.Unlock()
	r.audit.Log(audit.Entry{Event: "term_start", Target: target, PID: s.pid, Session: sess.id})
	sess.j.start()
	if s.openPipe != nil {
		sess.pipeFeed.Store(true)
		go sess.runPipe(s)
	}
	go sess.pump()
	if s.link != nil {
		go sess.idleLoop(r.ticker())
	}
	return sess
}

// List returns all live sessions, oldest first.
func (r *Registry) List() []Info {
	r.mu.Lock()
	all := make([]*Session, 0, len(r.sessions))
	for _, s := range r.sessions {
		all = append(all, s)
	}
	r.mu.Unlock()
	out := make([]Info, 0, len(all))
	for _, s := range all {
		out = append(out, s.info())
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].Started.Equal(out[j].Started) {
			return out[i].Started.Before(out[j].Started)
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// Kill hangs up session id's shell; false if there is no such session.
func (r *Registry) Kill(id string) bool {
	s := r.get(id)
	if s == nil {
		return false
	}
	s.hangUp()
	s.tr().kill()
	return true
}

// kill marks the session as user-killed and hangs it up in the background
// (SIGHUP, SIGKILL after hupGrace); it returns at once.
func (s *Session) kill() {
	s.mu.Lock()
	s.killed = true
	s.mu.Unlock()
	s.hangUp()
	s.dropSynced()
	go s.tr().kill()
}

// KillAll hangs up every session (shutdown).
func (r *Registry) KillAll() {
	for _, i := range r.List() {
		r.Kill(i.ID)
	}
}

// ListHandler serves GET /api/sessions. Callers must wrap it with authentication.
func (r *Registry) ListHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(r.List())
	})
}
