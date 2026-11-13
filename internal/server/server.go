// Package server wires tdog's HTTP routes.
package server

import (
	"io/fs"
	"net/http"

	"github.com/JMO-Labs/tdog/internal/auth"
	"github.com/JMO-Labs/tdog/web"
)

// New returns the root handler serving the embedded web build.
func New() http.Handler { return NewWithUI(web.FS()) }

// NewWithUI returns the root handler serving ui at "/".
func NewWithUI(ui fs.FS) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("GET /", uiHandler(ui))
	return mux
}

// NewSecured returns the embedded-UI handler behind a's authentication
// middleware, with the login/logout/setup routes registered.
func NewSecured(ui fs.FS, a *auth.Auth) http.Handler {
	mux := http.NewServeMux()
	a.Register(mux)
	mux.Handle("/", NewWithUI(ui))
	return a.Middleware(mux)
}
