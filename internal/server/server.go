// Package server wires tdog's HTTP routes.
package server

import (
	"io/fs"
	"net/http"

	"github.com/JMO-Labs/tdog/internal/term"
	"github.com/JMO-Labs/tdog/web"
)

// Auth reports whether a request is authenticated (ADR-0003).
type Auth func(*http.Request) bool

// New returns the root handler serving the embedded web build. The terminal
// WebSocket is mounted only when auth is non-nil, so an unauthenticated shell
// can never be exposed by accident.
func New(auth Auth) http.Handler { return build(web.FS(), auth) }

// NewWithUI returns the root handler serving ui at "/" (no terminal).
func NewWithUI(ui fs.FS) http.Handler { return build(ui, nil) }

func build(ui fs.FS, auth Auth) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	if auth != nil {
		th := term.Handler("")
		mux.HandleFunc("GET /ws/term", func(w http.ResponseWriter, r *http.Request) {
			if !auth(r) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			th.ServeHTTP(w, r)
		})
	}
	mux.Handle("GET /", uiHandler(ui))
	return mux
}
