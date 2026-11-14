// Package server wires tdog's HTTP routes.
package server

import (
	"io/fs"
	"net/http"

	"github.com/JMO-Labs/tdog/internal/auth"
	"github.com/JMO-Labs/tdog/internal/term"
	"github.com/JMO-Labs/tdog/web"
)

// New returns the root handler serving the embedded web build (no terminal).
func New() http.Handler { return NewWithUI(web.FS()) }

// NewWithUI returns the root handler serving ui at "/". It never mounts the
// terminal: /ws/term only exists behind authentication (see NewSecured).
func NewWithUI(ui fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("GET /", uiHandler(ui))
	return mux
}

// NewSecured returns the embedded-UI handler behind a's authentication
// middleware, with the login/logout/setup routes and the terminal WebSocket
// (ADR-0003) registered.
func NewSecured(ui fs.FS, a *auth.Auth) http.Handler {
	mux := http.NewServeMux()
	a.Register(mux)
	reg := term.NewRegistry(a.Audit(), 0)
	mux.Handle("GET /ws/term", term.NewHandler(term.Config{SSH: term.SSHConfigFromEnv(), Audit: a.Audit(), Registry: reg}))
	mux.Handle("GET /api/sessions", reg.ListHandler())
	mux.Handle("/", NewWithUI(ui))
	return a.Middleware(mux)
}
