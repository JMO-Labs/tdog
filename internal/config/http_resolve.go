package config

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// loadPreset decodes a stored preset; empty name means "no layer".
func (s *Store) loadPreset(kind, name string) (any, error) {
	if name == "" {
		return nil, nil
	}
	b, err := s.Get(kind, name)
	if err != nil {
		return nil, fmt.Errorf("%s preset %q: %w", kind, name, err)
	}
	return Decode(kind, b)
}

func (s *Store) resolve(w http.ResponseWriter, r *http.Request, pane *Terminal) {
	g, err := s.LoadGlobal()
	if err != nil {
		fail(w, err)
		return
	}
	var sc *Scene
	var tp *Terminal
	if v, err := s.loadPreset(KindScene, r.URL.Query().Get("scene")); err != nil {
		fail(w, err)
		return
	} else if v != nil {
		sc = v.(*Scene)
	}
	if v, err := s.loadPreset(KindTerminal, r.URL.Query().Get("terminal")); err != nil {
		fail(w, err)
		return
	} else if v != nil {
		tp = v.(*Terminal)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(Resolve(g, sc, tp, pane))
}

func (s *Store) registerResolve(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/presets/resolve", func(w http.ResponseWriter, r *http.Request) {
		s.resolve(w, r, nil)
	})
	mux.HandleFunc("POST /api/presets/resolve", func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
		if err != nil {
			fail(w, err)
			return
		}
		v, err := Decode(KindTerminal, b)
		if err != nil {
			fail(w, err)
			return
		}
		s.resolve(w, r, v.(*Terminal))
	})
}
