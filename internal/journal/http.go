package journal

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// NewHandler returns a mux serving the journal routes for tests.
func NewHandler(s *Store) http.Handler {
	mux := http.NewServeMux()
	s.Register(mux)
	return mux
}

// Register mounts GET /api/journal and PUT /api/journal/settings. Callers must
// wrap mux with authentication (its CSRF rule covers the PUT).
func (s *Store) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/journal", func(w http.ResponseWriter, r *http.Request) {
		secs, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64) // bad = 0
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.Header().Set("Cache-Control", "no-store")
		enc := json.NewEncoder(w)
		for _, l := range s.Read(time.Unix(secs, 0)) {
			if enc.Encode(l) != nil {
				return
			}
		}
	})
	mux.HandleFunc("PUT /api/journal/settings", func(w http.ResponseWriter, r *http.Request) {
		var v struct {
			H *int `json:"retentionHours"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&v) != nil || v.H == nil || !validHours(*v.H) {
			http.Error(w, "retentionHours must be 0, 12, 24 or 36", http.StatusBadRequest)
			return
		}
		if err := s.SetRetention(*v.H); err != nil {
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
