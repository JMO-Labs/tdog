package term

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/config"
)

const sceneDev = `
name = "dev"
autostart = true
[[panes]]
id = "a"
preset = "t1"
[[panes]]
id = "b"
preset = "t1"
[panes.override]
cwd = "/tmp"
`

func sceneRig(t *testing.T, scenes map[string]string) (*Scenes, *Registry) {
	t.Helper()
	store := config.NewStore(t.TempDir())
	if err := store.Put(config.KindTerminal, "t1", []byte(`target = "container"`)); err != nil {
		t.Fatal(err)
	}
	for n, src := range scenes {
		if err := store.Put(config.KindScene, n, []byte(src)); err != nil {
			t.Fatal(err)
		}
	}
	reg := NewRegistry(nil, 0)
	t.Cleanup(reg.KillAll)
	return NewScenes(Config{Shell: "/bin/sh", Presets: store, Registry: reg}), reg
}

func TestSceneStartLaunchesEveryPaneTagged(t *testing.T) {
	s, reg := sceneRig(t, map[string]string{"dev": sceneDev})
	run, err := s.Start("dev")
	if err != nil {
		t.Fatal(err)
	}
	if run.Existing || len(run.Panes) != 2 || run.Panes[0].Pane != "a" || run.Panes[1].Pane != "b" {
		t.Fatalf("run: %+v", run)
	}
	infos := reg.List()
	if len(infos) != 2 {
		t.Fatalf("sessions: %d", len(infos))
	}
	for _, i := range infos {
		if i.Scene != run.Scene {
			t.Fatalf("session %s tagged %q, want %q", i.ID, i.Scene, run.Scene)
		}
	}
}

func TestSceneStartIsIdempotentWhileRunning(t *testing.T) {
	s, reg := sceneRig(t, map[string]string{"dev": sceneDev})
	first, err := s.Start("dev")
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.Start("dev")
	if err != nil {
		t.Fatal(err)
	}
	if !again.Existing || again.Scene != first.Scene || len(again.Panes) != 2 || len(reg.List()) != 2 {
		t.Fatalf("again: %+v (sessions %d)", again, len(reg.List()))
	}
	for i := range first.Panes {
		if again.Panes[i] != first.Panes[i] {
			t.Fatalf("pane %d changed: %+v vs %+v", i, again.Panes[i], first.Panes[i])
		}
	}
}

func TestSceneStartsAgainAfterAllSessionsEnd(t *testing.T) {
	s, reg := sceneRig(t, map[string]string{"dev": sceneDev})
	first, _ := s.Start("dev")
	reg.KillAll()
	deadline := time.Now().Add(10 * time.Second)
	for len(reg.List()) > 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	next, err := s.Start("dev")
	if err != nil {
		t.Fatal(err)
	}
	if next.Existing || next.Scene == first.Scene {
		t.Fatalf("expected a fresh run: %+v", next)
	}
}

func TestAutostartOnlyStartsFlaggedScenes(t *testing.T) {
	s, reg := sceneRig(t, map[string]string{
		"dev":  sceneDev,
		"idle": "[[panes]]\npreset = \"t1\"\n",
	})
	if n := s.Autostart(); n != 1 {
		t.Fatalf("started %d scenes", n)
	}
	if len(reg.List()) != 2 {
		t.Fatalf("sessions: %d", len(reg.List()))
	}
	if n := s.Autostart(); n != 0 || len(reg.List()) != 2 {
		t.Fatalf("second autostart not a no-op: %d, %d sessions", n, len(reg.List()))
	}
}

func TestSceneStartBadPaneStartsNothing(t *testing.T) {
	s, reg := sceneRig(t, map[string]string{
		"bad": "[[panes]]\npreset = \"t1\"\n[[panes]]\npreset = \"missing\"\n",
	})
	if _, err := s.Start("bad"); err == nil {
		t.Fatal("missing preset accepted")
	}
	if len(reg.List()) != 0 {
		t.Fatalf("leaked %d sessions", len(reg.List()))
	}
}

func TestSceneStartRoute(t *testing.T) {
	s, _ := sceneRig(t, map[string]string{"dev": sceneDev})
	mux := http.NewServeMux()
	s.Register(mux)
	do := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", path, nil))
		return w
	}
	w := do("/api/scenes/dev/start")
	var run SceneRun
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &run) != nil || len(run.Panes) != 2 || run.Existing {
		t.Fatalf("start: %d %s", w.Code, w.Body)
	}
	w = do("/api/scenes/dev/start")
	if json.Unmarshal(w.Body.Bytes(), &run) != nil || !run.Existing {
		t.Fatalf("repeat: %d %s", w.Code, w.Body)
	}
	if w := do("/api/scenes/nope/start"); w.Code != 404 {
		t.Fatalf("missing: %d", w.Code)
	}
}

func TestSceneStartReturnsLayout(t *testing.T) {
	src := sceneDev + `
[layout]
type = "split"
dir = "row"
ratio = 0.5
[layout.a]
type = "pane"
pane = "a"
[layout.b]
type = "pane"
pane = "b"
`
	s, _ := sceneRig(t, map[string]string{"dev": src})
	run, err := s.Start("dev")
	if err != nil {
		t.Fatal(err)
	}
	if run.Layout == nil || run.Layout.Type != "split" || run.Layout.A.Pane != "a" {
		t.Fatalf("layout: %+v", run.Layout)
	}
	again, _ := s.Start("dev")
	if again.Layout == nil {
		t.Fatal("layout lost on repeat start")
	}
}
