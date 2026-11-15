package config

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/JMO-Labs/tdog/docs/schema"
)

const maxBody = 1 << 20

// Register mounts the preset and schema routes. They must sit behind the
// auth middleware, which supplies session and CSRF checks (ADR-0003).
func (s *Store) Register(mux *http.ServeMux) {
	s.registerResolve(mux)
	mux.HandleFunc("GET /api/schema/{kind}", func(w http.ResponseWriter, r *http.Request) {
		b, ok := schema.Get(r.PathValue("kind"))
		if !ok {
			jerr(w, http.StatusNotFound, "unknown schema")
			return
		}
		w.Header().Set("Content-Type", "application/schema+json")
		_, _ = w.Write(b)
	})
	mux.HandleFunc("GET /api/presets/{kind}", func(w http.ResponseWriter, r *http.Request) {
		names, err := s.List(r.PathValue("kind"))
		if err != nil {
			fail(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(names)
	})
	mux.HandleFunc("GET /api/presets/{kind}/{name}", func(w http.ResponseWriter, r *http.Request) {
		b, err := s.Get(r.PathValue("kind"), r.PathValue("name"))
		if err != nil {
			fail(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/toml; charset=utf-8")
		_, _ = w.Write(b)
	})
	mux.HandleFunc("PUT /api/presets/{kind}/{name}", func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
		if err != nil {
			fail(w, err)
			return
		}
		if err := s.Put(r.PathValue("kind"), r.PathValue("name"), b); err != nil {
			fail(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("DELETE /api/presets/{kind}/{name}", func(w http.ResponseWriter, r *http.Request) {
		if err := s.Delete(r.PathValue("kind"), r.PathValue("name")); err != nil {
			fail(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func jerr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func fail(w http.ResponseWriter, err error) {
	var ve *ValidationError
	var mb *http.MaxBytesError
	switch {
	case errors.As(err, &ve):
		jerr(w, http.StatusBadRequest, ve.Error())
	case errors.As(err, &mb):
		jerr(w, http.StatusRequestEntityTooLarge, "body too large")
	case errors.Is(err, ErrBadName):
		jerr(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrBadKind), errors.Is(err, ErrNotFound):
		jerr(w, http.StatusNotFound, err.Error())
	default:
		jerr(w, http.StatusInternalServerError, "internal error")
	}
}
