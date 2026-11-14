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

// add registers a running shell and starts pumping its output.
func (r *Registry) add(target, scene string, s *session) *Session {
	sess := &Session{
		id: newID(), scene: scene, target: target, started: time.Now().UTC(),
		s: s, reg: r, ring: newRing(r.scrollback),
	}
	r.mu.Lock()
	r.sessions[sess.id] = sess
	r.mu.Unlock()
	r.audit.Log(audit.Entry{Event: "term_start", Target: target, PID: s.pid, Session: sess.id})
	go sess.pump()
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
	s.s.kill()
	return true
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

// KillHandler serves POST /api/sessions/{id}/kill (204, or 404 if unknown).
// Callers must wrap it with authentication and register it with an {id} wildcard.
func (r *Registry) KillHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if !r.Kill(req.PathValue("id")) {
			http.Error(w, "unknown session", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
