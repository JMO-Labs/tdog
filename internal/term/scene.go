package term

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/config"
)

// PaneSession is the session launched for one scene pane slot.
type PaneSession struct {
	Pane    string `json:"pane"`
	Session string `json:"session"`
}

// SceneRun is the result of starting a scene preset (spec §7).
type SceneRun struct {
	Scene    string        `json:"scene"` // scene id the sessions are tagged with
	Name     string        `json:"name"`
	Existing bool          `json:"existing"` // true when it was already running
	Panes    []PaneSession `json:"panes"`

	// Layout is the preset's layout tree (nil when the preset has none).
	Layout *config.Layout `json:"layout,omitempty"`
}

// Scenes launches scene presets: every pane's terminal preset in one go,
// tagged with a fresh scene id. It is safe for concurrent use.
type Scenes struct {
	l     *launcher
	store *config.Store
	audit *audit.Logger
	mu    sync.Mutex
	runs  map[string]SceneRun // preset name -> last started run
}

// NewScenes returns a scene launcher using cfg's registry, targets and presets.
func NewScenes(cfg Config) *Scenes {
	return &Scenes{l: newLauncher(cfg), store: cfg.Presets, audit: cfg.Audit, runs: map[string]SceneRun{}}
}

// alive returns the run's panes that still have a live session.
func (s *Scenes) alive(r SceneRun) []PaneSession {
	var out []PaneSession
	for _, p := range r.Panes {
		if s.l.reg.get(p.Session) != nil {
			out = append(out, p)
		}
	}
	return out
}

// Start launches scene preset name. If an earlier start of it still has live
// sessions, nothing is launched and that run is returned with Existing set.
func (s *Scenes) Start(name string) (SceneRun, error) {
	if s.store == nil {
		return SceneRun{}, errors.New("presets are not configured")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.runs[name]; ok {
		if live := s.alive(r); len(live) > 0 {
			r.Panes, r.Existing = live, true
			return r, nil
		}
		delete(s.runs, name)
	}
	b, err := s.store.Get(config.KindScene, name)
	if err != nil {
		return SceneRun{}, err
	}
	v, err := config.Decode(config.KindScene, b)
	if err != nil {
		return SceneRun{}, err
	}
	sc := v.(*config.Scene)
	g, err := s.store.LoadGlobal()
	if err != nil {
		return SceneRun{}, err
	}
	// Resolve everything first so a bad pane starts nothing.
	type launch struct {
		pane string
		sp   Spec
		line string
	}
	var plan []launch
	for i, p := range sc.Panes {
		sp, line, err := s.resolvePane(g, sc, p)
		if err != nil {
			return SceneRun{}, fmt.Errorf("panes[%d]: %w", i, err)
		}
		plan = append(plan, launch{paneSlot(p, i), sp, line})
	}
	run := SceneRun{Scene: "sc-" + newID()[:12], Name: name, Layout: sc.Layout}
	for _, pl := range plan {
		sess, err := s.l.start(run.Scene, pl.sp, pl.line)
		if err != nil {
			for _, started := range run.Panes {
				s.l.reg.Kill(started.Session)
			}
			return SceneRun{}, err
		}
		run.Panes = append(run.Panes, PaneSession{Pane: pl.pane, Session: sess.id})
	}
	s.runs[name] = run
	n := len(run.Panes)
	s.audit.Log(audit.Entry{Event: "scene_start", Scene: run.Scene, Count: &n})
	return run, nil
}

func paneSlot(p config.Pane, i int) string {
	if p.ID != "" {
		return p.ID
	}
	return fmt.Sprintf("pane-%d", i+1)
}

func (s *Scenes) resolvePane(g *config.Global, sc *config.Scene, p config.Pane) (Spec, string, error) {
	var t *config.Terminal
	if p.Preset != "" {
		b, err := s.store.Get(config.KindTerminal, p.Preset)
		if err != nil {
			return Spec{}, "", err
		}
		v, err := config.Decode(config.KindTerminal, b)
		if err != nil {
			return Spec{}, "", err
		}
		t = v.(*config.Terminal)
	}
	sp, err := specFromResolved(config.Resolve(g, sc, t, p.Override))
	if err != nil {
		return Spec{}, "", err
	}
	if msg := checkTarget(sp.Target, sp.Persistent); msg != "" {
		return Spec{}, "", errors.New(msg)
	}
	line, err := BuildLine(sp.Pre, sp.Command, sp.Post)
	return sp, line, err
}

// Autostart starts every scene preset with autostart = true; failures are
// logged and do not stop the others. It returns how many scenes started.
func (s *Scenes) Autostart() int {
	if s.store == nil {
		return 0
	}
	names, err := s.store.List(config.KindScene)
	if err != nil {
		log.Printf("term: autostart: %v", err)
		return 0
	}
	started := 0
	for _, n := range names {
		b, err := s.store.Get(config.KindScene, n)
		if err != nil {
			continue
		}
		v, err := config.Decode(config.KindScene, b)
		if err != nil || !v.(*config.Scene).Autostart {
			continue
		}
		if r, err := s.Start(n); err != nil {
			log.Printf("term: autostart %s: %v", n, err)
		} else if !r.Existing {
			started++
		}
	}
	return started
}

// Register mounts POST /api/scenes/{name}/start. Callers must wrap mux with
// authentication (its CSRF rule covers the POST).
func (s *Scenes) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/scenes/{name}/start", func(w http.ResponseWriter, r *http.Request) {
		run, err := s.Start(r.PathValue("name"))
		if err != nil {
			var ve *config.ValidationError
			code := http.StatusInternalServerError
			switch {
			case errors.Is(err, config.ErrNotFound), errors.Is(err, config.ErrBadName):
				code = http.StatusNotFound
			case errors.As(err, &ve):
				code = http.StatusBadRequest
			}
			http.Error(w, err.Error(), code)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(run)
	})
}
