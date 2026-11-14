package term

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/config"
)

const oneT1 = "[[panes]]\npreset = \"t1\"\n"

// coverRig is sceneRig with raw access to the store directory, so tests can
// plant files that Store.Put would refuse.
func coverRig(t *testing.T) (*Scenes, *Registry, string) {
	t.Helper()
	dir := t.TempDir()
	store := config.NewStore(dir)
	if err := store.Put(config.KindTerminal, "t1", []byte(`target = "container"`)); err != nil {
		t.Fatal(err)
	}
	reg := NewRegistry(nil, 0)
	t.Cleanup(reg.KillAll)
	return NewScenes(Config{Shell: "/bin/sh", Presets: store, Registry: reg}), reg, dir
}

func plant(t *testing.T, dir, kind, name, src string) {
	t.Helper()
	d := filepath.Join(dir, "presets", kind)
	if err := os.MkdirAll(d, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(d, name+".toml"), []byte(src), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestScenesWithoutStore(t *testing.T) {
	s := NewScenes(Config{Shell: "/bin/sh"})
	if _, err := s.Start("dev"); err == nil {
		t.Fatal("Start without presets succeeded")
	}
	if n := s.Autostart(); n != 0 {
		t.Fatalf("autostart: %d", n)
	}
}

func TestSceneStartRejectsBrokenConfig(t *testing.T) {
	cases := map[string]func(t *testing.T, dir string){
		"corrupt scene": func(t *testing.T, dir string) {
			plant(t, dir, "scenes", "dev", "panes = [")
		},
		"corrupt global": func(t *testing.T, dir string) {
			plant(t, dir, "scenes", "dev", oneT1)
			if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte("default_target = ["), 0o600); err != nil {
				t.Fatal(err)
			}
		},
		"corrupt terminal": func(t *testing.T, dir string) {
			plant(t, dir, "scenes", "dev", oneT1)
			plant(t, dir, "terminals", "t1", "target = [")
		},
		"bad env name": func(t *testing.T, dir string) {
			plant(t, dir, "scenes", "dev", oneT1)
			plant(t, dir, "terminals", "t1", "[env]\n\"1BAD\" = \"x\"\n")
		},
		"unsupported target": func(t *testing.T, dir string) {
			plant(t, dir, "scenes", "dev", oneT1)
			plant(t, dir, "terminals", "t1", `target = "nsenter"`)
		},
	}
	for name, setup := range cases {
		t.Run(name, func(t *testing.T) {
			s, reg, dir := coverRig(t)
			setup(t, dir)
			if _, err := s.Start("dev"); err == nil {
				t.Fatal("broken config accepted")
			}
			if len(reg.List()) != 0 {
				t.Fatalf("leaked %d sessions", len(reg.List()))
			}
		})
	}
}

func TestSceneStartKillsStartedPanesWhenLaterSpawnFails(t *testing.T) {
	s, reg, dir := coverRig(t)
	plant(t, dir, "scenes", "dev", oneT1+"[[panes]]\npreset = \"t1\"\n[panes.override]\ncwd = \"/nonexistent-tdog-dir\"\n")
	if _, err := s.Start("dev"); err == nil {
		t.Fatal("spawn failure not reported")
	}
	waitNoSessions(t, reg)
}

func waitNoSessions(t *testing.T, reg *Registry) {
	t.Helper()
	for i := 0; i < 500 && len(reg.List()) > 0; i++ {
		time.Sleep(20 * time.Millisecond)
	}
	if n := len(reg.List()); n != 0 {
		t.Fatalf("%d sessions still running", n)
	}
}

func TestAutostartSurvivesBadScenes(t *testing.T) {
	s, reg, dir := coverRig(t)
	plant(t, dir, "scenes", "b-corrupt", "panes = [")
	plant(t, dir, "scenes", "c-ok", "autostart = true\n"+oneT1)
	plant(t, dir, "scenes", "a-bad", "autostart = true\n[[panes]]\npreset = \"missing\"\n")
	if err := os.Symlink("/nonexistent-tdog", filepath.Join(dir, "presets", "scenes", "ghost.toml")); err != nil {
		t.Fatal(err)
	}
	if n := s.Autostart(); n != 1 {
		t.Fatalf("started %d scenes", n)
	}
	if len(reg.List()) != 1 {
		t.Fatalf("sessions: %d", len(reg.List()))
	}
}

func TestAutostartListError(t *testing.T) {
	s, _, dir := coverRig(t)
	if err := os.MkdirAll(filepath.Join(dir, "presets"), 0o700); err != nil {
		t.Fatal(err)
	}
	// "scenes" is a file, so listing it fails with something other than not-exist.
	if err := os.WriteFile(filepath.Join(dir, "presets", "scenes"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if n := s.Autostart(); n != 0 {
		t.Fatalf("started %d scenes", n)
	}
}

func TestSceneStartRouteInvalidSceneIs400(t *testing.T) {
	s, _, dir := coverRig(t)
	plant(t, dir, "scenes", "dev", "panes = [")
	mux := http.NewServeMux()
	s.Register(mux)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/scenes/dev/start", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
}
