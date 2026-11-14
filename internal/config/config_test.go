package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const specExample = `name = "app-dev"
target = "ssh-host"
cwd = "~/code/app"
env = { NODE_ENV = "development" }
persistent = false
pre_exec  = { mode = "stop_on_fail", run = ["cd ~/code/app", "source .venv/bin/activate"] }
command   = "npm run dev"
post_exec = { mode = "all", run = ["notify-send done"] }
on_close  = { mode = "all", run = ["docker compose down"] }
theme = "mtv-neon"
font = { family = "JetBrainsMono Nerd Font", size = 14, ligatures = true }
background = { kind = "shader", ref = "vhs-grain", opacity = 0.85, blur = 4 }
`

func TestRoundTripSpecExample(t *testing.T) {
	s := NewStore(t.TempDir())
	if err := s.Put(KindTerminal, "app-dev", []byte(specExample)); err != nil {
		t.Fatal(err)
	}
	raw, err := s.Get(KindTerminal, "app-dev")
	if err != nil {
		t.Fatal(err)
	}
	// stored form must decode to the same value
	a, err := Decode(KindTerminal, []byte(specExample))
	if err != nil {
		t.Fatal(err)
	}
	b, err := Decode(KindTerminal, raw)
	if err != nil {
		t.Fatal(err)
	}
	ta, tb := a.(*Terminal), b.(*Terminal)
	if ta.Command != "npm run dev" || ta.PreExec.Mode != "stop_on_fail" || len(ta.PreExec.Run) != 2 ||
		ta.Font.Size != 14 || ta.Background.Opacity != 0.85 || ta.Env["NODE_ENV"] != "development" {
		t.Fatalf("decoded: %+v", ta)
	}
	if tb.Command != ta.Command || tb.OnClose.Run[0] != "docker compose down" || tb.Font.Family != ta.Font.Family {
		t.Fatalf("round trip: %+v", tb)
	}
}

func TestHookShorthand(t *testing.T) {
	v, err := Decode(KindTerminal, []byte(`pre_exec = "cd /x"`))
	if err != nil {
		t.Fatal(err)
	}
	h := v.(*Terminal).PreExec
	if h.Mode != "all" || len(h.Run) != 1 || h.Run[0] != "cd /x" {
		t.Fatalf("%+v", h)
	}
}

func TestValidationErrorsHaveFieldPath(t *testing.T) {
	cases := map[string]struct{ kind, body, path string }{
		"unknown key":    {KindTerminal, "bogus = 1", "bogus"},
		"unknown nested": {KindTerminal, "font = { sizee = 3 }", "font.sizee"},
		"bad target":     {KindTerminal, `target = "mars"`, "target"},
		"bad size":       {KindTerminal, "font = { size = 2 }", "font.size"},
		"bad opacity":    {KindTerminal, "background = { opacity = 2.0 }", "background.opacity"},
		"bad hook mode":  {KindTerminal, `post_exec = { mode = "x", run = ["a"] }`, "post_exec.mode"},
		"hook unknown":   {KindTerminal, `on_close = { mode = "all", runs = ["a"] }`, "on_close.runs"},
		"scene unknown":  {KindScene, "zzz = true", "zzz"},
		"scene pane":     {KindScene, "[[panes]]\npreset = \"../x\"", "panes[0].preset"},
		"global target":  {KindGlobal, `default_target = "mars"`, "default_target"},
		"syntax":         {KindTerminal, "= = =", ""},
	}
	for n, c := range cases {
		_, err := Decode(c.kind, []byte(c.body))
		var ve *ValidationError
		if !errors.As(err, &ve) {
			t.Fatalf("%s: want ValidationError, got %v", n, err)
		}
		if ve.Path != c.path || (c.path != "" && !strings.Contains(err.Error(), c.path)) {
			t.Fatalf("%s: path %q want %q (%v)", n, ve.Path, c.path, err)
		}
	}
}

func TestTraversalRejected(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	for _, n := range []string{"..", "../x", "a/b", `a\b`, "", ".hidden", "A", "x.toml", strings.Repeat("a", 65), "a\x00b"} {
		if err := s.Put(KindTerminal, n, []byte(`target = "container"`)); !errors.Is(err, ErrBadName) {
			t.Fatalf("put %q: %v", n, err)
		}
		if _, err := s.Get(KindTerminal, n); !errors.Is(err, ErrBadName) {
			t.Fatalf("get %q: %v", n, err)
		}
		if err := s.Delete(KindTerminal, n); !errors.Is(err, ErrBadName) {
			t.Fatalf("delete %q: %v", n, err)
		}
	}
	if err := s.Put("nope", "x", nil); !errors.Is(err, ErrBadKind) {
		t.Fatalf("kind: %v", err)
	}
	if err := s.Put(KindGlobal, "x", nil); !errors.Is(err, ErrBadKind) {
		t.Fatalf("global is not a preset kind: %v", err)
	}
	if ents, _ := os.ReadDir(dir); len(ents) != 0 {
		t.Fatalf("files escaped: %v", ents)
	}
}

func TestCRUDAndAtomic(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	if _, err := s.Get(KindScene, "a"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if err := s.Delete(KindScene, "a"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	for _, n := range []string{"b", "a"} {
		if err := s.Put(KindScene, n, []byte("autostart = true")); err != nil {
			t.Fatal(err)
		}
	}
	names, err := s.List(KindScene)
	if err != nil || len(names) != 2 || names[0] != "a" || names[1] != "b" {
		t.Fatalf("%v %v", names, err)
	}
	if err := s.Put(KindScene, "a", []byte("bogus = 1")); err == nil {
		t.Fatal("invalid write accepted")
	}
	raw, _ := s.Get(KindScene, "a")
	if !strings.Contains(string(raw), "autostart") {
		t.Fatalf("invalid write clobbered file: %q", raw)
	}
	ents, _ := os.ReadDir(filepath.Join(dir, "presets", "scenes"))
	for _, e := range ents {
		if !strings.HasSuffix(e.Name(), ".toml") {
			t.Fatalf("temp file left behind: %s", e.Name())
		}
	}
	if err := s.Delete(KindScene, "a"); err != nil {
		t.Fatal(err)
	}
	if names, _ := s.List(KindScene); len(names) != 1 {
		t.Fatalf("%v", names)
	}
	if names, err := s.List(KindTerminal); err != nil || len(names) != 0 {
		t.Fatalf("empty list: %v %v", names, err)
	}
}

func TestGlobalConfig(t *testing.T) {
	s := NewStore(t.TempDir())
	g, err := s.LoadGlobal()
	if err != nil || g == nil {
		t.Fatalf("missing config.toml must yield defaults: %v", err)
	}
	if err := os.WriteFile(filepath.Join(s.dir, "config.toml"), []byte("default_target = \"container\"\ntheme = \"x\""), 0o600); err != nil {
		t.Fatal(err)
	}
	g, err = s.LoadGlobal()
	if err != nil || g.DefaultTarget != "container" || g.Theme != "x" {
		t.Fatalf("%+v %v", g, err)
	}
	if err := os.WriteFile(filepath.Join(s.dir, "config.toml"), []byte("nope = 1"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LoadGlobal(); err == nil {
		t.Fatal("unknown key accepted")
	}
}
