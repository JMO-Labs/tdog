// Package server wires tdog's HTTP routes.
package server

import (
	"context"
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/JMO-Labs/tdog/internal/assets"
	"github.com/JMO-Labs/tdog/internal/auth"
	"github.com/JMO-Labs/tdog/internal/config"
	"github.com/JMO-Labs/tdog/internal/fonts"
	"github.com/JMO-Labs/tdog/internal/journal"
	"github.com/JMO-Labs/tdog/internal/plugins"
	"github.com/JMO-Labs/tdog/internal/term"
	"github.com/JMO-Labs/tdog/web"
)

// journalSweep is how often expired synced history is deleted.
const journalSweep = 10 * time.Minute

// journalCtx ends the sweep goroutines; tests swap it to stop them.
var journalCtx = context.Background()

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
	var js *journal.Store
	if store != nil { // optional server-side history sync under $TDOG_DATA/journal
		js = journal.NewStore(store.Dir())
		reg.SetJournalStore(js) // before any session can exist (rediscovery below)
		js.Sweep(time.Now())    // drop what expired while down
		go js.Run(journalCtx, journalSweep)
	}
	if _, err := os.Stat(sshCfg.KeyPath); err == nil { // reattach persistent tmux sessions
		go func() {
			if n, err := reg.RediscoverSSH(sshCfg); err != nil {
				log.Printf("term: tmux rediscovery: %v", err)
			} else if n > 0 {
				log.Printf("term: reattached %d tmux session(s)", n)
			}
		}()
	}
	tcfg := term.Config{SSH: sshCfg, Audit: a.Audit(), Registry: reg, Presets: store}
	mux.Handle("GET /ws/term", term.NewHandler(tcfg))
	mux.Handle("GET /api/sessions", reg.ListHandler())
	mux.Handle("GET /api/shell", term.ShellInfoHandler(term.PickShell("")))
	mux.Handle("POST /api/diff", term.NewDiffHandler(term.DiffHandlerConfig{
		Registry: reg,
		SSH:      sshCfg,
		Audit:    a.Audit(),
	}))
	reg.RegisterKill(mux)
	if store != nil {
		store.Register(mux)
		js.Register(mux)
		fonts.New(store.Dir(), nil).Register(mux)
		assets.New(store.Dir()).Register(mux)
		plugins.NewHTTPHandler(plugins.New(store.Dir()), a.Audit()).Register(mux)
		scenes := term.NewScenes(tcfg)
		scenes.Register(mux)
		go scenes.Autostart() // after routes exist; sessions outlive any browser
	}
	mux.Handle("/", NewWithUI(ui))
	return a.Middleware(mux)
}
