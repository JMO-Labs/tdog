// Package server wires tdog's HTTP routes.
package server

import (
	"io/fs"
	"log"
	"net/http"
	"os"

	"github.com/JMO-Labs/tdog/internal/auth"
	"github.com/JMO-Labs/tdog/internal/config"
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
func NewSecured(ui fs.FS, a *auth.Auth) http.Handler { return NewSecuredPresets(ui, a, nil) }

// sshConfig is a seam so tests can point rediscovery at a fake host.
var sshConfig = term.SSHConfigFromEnv

// NewSecuredPresets is NewSecured plus the preset and schema routes backed by
// store (skipped when nil). They sit behind the same session + CSRF checks.
func NewSecuredPresets(ui fs.FS, a *auth.Auth, store *config.Store) http.Handler {
	mux := http.NewServeMux()
	a.Register(mux)
	reg := term.NewRegistry(a.Audit(), 0)
	sshCfg := sshConfig()
	if _, err := os.Stat(sshCfg.KeyPath); err == nil { // reattach persistent tmux sessions
		go func() {
			if n, err := reg.RediscoverSSH(sshCfg); err != nil {
				log.Printf("term: tmux rediscovery: %v", err)
			} else if n > 0 {
				log.Printf("term: reattached %d tmux session(s)", n)
			}
		}()
	}
	mux.Handle("GET /ws/term", term.NewHandler(term.Config{SSH: sshCfg, Audit: a.Audit(), Registry: reg, Presets: store}))
	mux.Handle("GET /api/sessions", reg.ListHandler())
	reg.RegisterKill(mux)
	if store != nil {
		store.Register(mux)
	}
	mux.Handle("/", NewWithUI(ui))
	return a.Middleware(mux)
}
