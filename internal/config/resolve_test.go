package config

import (
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func TestResolveLayers(t *testing.T) {
	g := &Global{DefaultTarget: "ssh-host", Theme: "g-theme", Font: &Font{Family: "Mono", Size: 12}}
	sc := &Scene{Theme: "s-theme", Background: &Background{Kind: "shader", Ref: "vhs"}}
	tp := &Terminal{
		Target: "container", Cwd: "~/app", Env: map[string]string{"A": "t", "B": "t"},
		PreExec: &Hook{Mode: "all", Run: []string{"t1", "t2"}}, Font: &Font{Size: 14},
	}
	po := &Terminal{
		Env: map[string]string{"B": "p", "C": "p"}, PreExec: &Hook{Mode: "stop_on_fail", Run: []string{"p1"}},
		Command: "ls",
	}
	cases := []struct {
		name       string
		g          *Global
		s          *Scene
		t, p       *Terminal
		wantOrigin map[string]string
		wantValue  map[string]any
	}{
		{"none", nil, nil, nil, nil, map[string]string{}, map[string]any{}},
		{"global only", g, nil, nil, nil,
			map[string]string{"target": "global", "theme": "global", "font.family": "global", "font.size": "global"},
			map[string]any{"target": "ssh-host", "font.size": 12}},
		{"scene overrides global", g, sc, nil, nil,
			map[string]string{"theme": "scene", "target": "global", "background.ref": "scene"},
			map[string]any{"theme": "s-theme", "background.kind": "shader"}},
		{"terminal overrides scene+global", g, sc, tp, nil,
			map[string]string{"target": "terminal", "font.size": "terminal", "font.family": "global", "theme": "scene", "cwd": "terminal"},
			map[string]any{"target": "container", "font.size": 14, "font.family": "Mono"}},
		{"env merges per key", g, sc, tp, po,
			map[string]string{"env.A": "terminal", "env.B": "pane", "env.C": "pane"},
			map[string]any{"env.A": "t", "env.B": "p", "env.C": "p"}},
		{"lists replace", g, sc, tp, po,
			map[string]string{"pre_exec": "pane", "command": "pane"},
			map[string]any{"pre_exec": map[string]any{"mode": "stop_on_fail", "run": []string{"p1"}}}},
		{"terminal list kept without pane", g, sc, tp, nil,
			map[string]string{"pre_exec": "terminal"},
			map[string]any{"pre_exec": map[string]any{"mode": "all", "run": []string{"t1", "t2"}}}},
		{"pane only", nil, nil, nil, po,
			map[string]string{"command": "pane", "env.C": "pane"}, map[string]any{"command": "ls"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := Resolve(c.g, c.s, c.t, c.p)
			for k, o := range c.wantOrigin {
				if f, ok := r[k]; !ok || f.Origin != o {
					t.Errorf("%s origin = %+v, want %s", k, r[k], o)
				}
			}
			for k, v := range c.wantValue {
				if f := r[k]; !reflect.DeepEqual(f.Value, v) {
					t.Errorf("%s value = %#v, want %#v", k, f.Value, v)
				}
			}
			if c.name == "none" && len(r) != 0 {
				t.Errorf("want empty, got %v", r)
			}
		})
	}
}

const sceneTOML = `name = "s"
theme = "mtv"
`

func resolveMux(t *testing.T) *http.ServeMux {
	t.Helper()
	mux := newMux(t)
	call(mux, "PUT", "/api/presets/scene/work", sceneTOML)
	call(mux, "PUT", "/api/presets/terminal/dev", specExample)
	return mux
}

func TestResolveRoutes(t *testing.T) {
	mux := resolveMux(t)
	w := call(mux, "GET", "/api/presets/resolve?scene=work&terminal=dev", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"origin":"terminal"`) {
		t.Fatalf("get: %d %s", w.Code, w.Body)
	}
	w = call(mux, "POST", "/api/presets/resolve?scene=work&terminal=dev", `command = "make"`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"origin":"pane"`) {
		t.Fatalf("post: %d %s", w.Code, w.Body)
	}
	if w := call(mux, "POST", "/api/presets/resolve", `bogus = 1`); w.Code != 400 {
		t.Fatalf("bad override: %d", w.Code)
	}
	for _, q := range []string{"?terminal=nope", "?scene=nope"} {
		w := call(mux, "GET", "/api/presets/resolve"+q, "")
		if w.Code != 404 || !strings.Contains(w.Body.String(), "nope") {
			t.Fatalf("%s: %d %s", q, w.Code, w.Body)
		}
	}
}
