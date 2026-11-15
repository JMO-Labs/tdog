package term

import (
	"encoding/json"
	"net/http"

	"github.com/JMO-Labs/tdog/internal/audit"
)

// killMatching signals every session for which match is true and returns the count.
func (r *Registry) killMatching(match func(*Session) bool) int {
	r.mu.Lock()
	var hit []*Session
	for _, s := range r.sessions {
		if match(s) {
			hit = append(hit, s)
		}
	}
	r.mu.Unlock()
	for _, s := range hit {
		s.kill()
	}
	return len(hit)
}

// RegisterKill mounts the kill routes on mux. Callers must wrap mux with
// authentication (its CSRF rule covers these POSTs).
func (r *Registry) RegisterKill(mux *http.ServeMux) {
	reply := func(w http.ResponseWriter, event, id, scene string, n int) {
		r.audit.Log(audit.Entry{Event: event, Session: id, Scene: scene, Count: &n})
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(map[string]int{"killed": n})
	}
	mux.HandleFunc("POST /api/sessions/{id}/kill", func(w http.ResponseWriter, req *http.Request) {
		id := req.PathValue("id")
		if n := r.killMatching(func(s *Session) bool { return s.id == id }); n > 0 {
			reply(w, "kill", id, "", n)
			return
		}
		http.Error(w, "no such session", http.StatusNotFound)
	})
	mux.HandleFunc("POST /api/scenes/{scene}/kill", func(w http.ResponseWriter, req *http.Request) {
		scene := req.PathValue("scene")
		reply(w, "kill_scene", "", scene, r.killMatching(func(s *Session) bool { return s.scene == scene }))
	})
	mux.HandleFunc("POST /api/sessions/kill-all", func(w http.ResponseWriter, _ *http.Request) {
		reply(w, "kill_all", "", "", r.killMatching(func(*Session) bool { return true }))
	})
}
