package config

import (
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func ptr[T any](v T) *T { return &v }

// layerFields lists, per field, the layers that set it (lowest first) and the
// value each sets. The expected result for any subset is the highest present.
var layerFields = map[string][]struct {
	origin string
	value  any
}{
	"target":             {{"global", "ssh-host"}, {"terminal", "container"}},
	"theme":              {{"global", "g-theme"}, {"scene", "s-theme"}},
	"font.size":          {{"global", 12}, {"terminal", 14}},
	"font.ligatures":     {{"global", true}, {"terminal", true}, {"pane", false}},
	"persistent":         {{"terminal", true}, {"pane", false}},
	"background.kind":    {{"global", "image"}, {"scene", "shader"}},
	"background.ref":     {{"global", "a.png"}, {"scene", "vhs"}},
	"background.opacity": {{"global", 0.9}, {"terminal", 0.5}, {"pane", 0.0}},
	"background.blur":    {{"global", 8}, {"terminal", 4}, {"pane", 0}},
	"command":            {{"pane", "ls"}},
	"cwd":                {{"terminal", "~/app"}},
}

func TestResolveLayers(t *testing.T) {
	g := &Global{DefaultTarget: "ssh-host", Theme: "g-theme", Font: &Font{Size: 12, Ligatures: ptr(true)},
		Background: &Background{Kind: "image", Ref: "a.png", Opacity: ptr(0.9), Blur: ptr(8)}}
	sc := &Scene{Theme: "s-theme", Background: &Background{Kind: "shader", Ref: "vhs"}}
	tp := &Terminal{Target: "container", Cwd: "~/app", Persistent: ptr(true)}
	tp.Font = &Font{Size: 14, Ligatures: ptr(true)}
	tp.Background = &Background{Opacity: ptr(0.5), Blur: ptr(4)}
	po := &Terminal{Command: "ls", Persistent: ptr(false)}
	po.Font = &Font{Ligatures: ptr(false)}
	po.Background = &Background{Opacity: ptr(0.0), Blur: ptr(0)}
	names := []string{"global", "scene", "terminal", "pane"}
	for mask := 0; mask < 16; mask++ {
		var parts []string
		for i, n := range names {
			if mask&(1<<i) != 0 {
				parts = append(parts, n)
			}
		}
		name := "none"
		if len(parts) > 0 {
			name = strings.Join(parts, "+")
		}
		t.Run(name, func(t *testing.T) {
			has := map[string]bool{}
			var gg *Global
			var ss *Scene
			var tt, pp *Terminal
			for i, n := range names {
				has[n] = mask&(1<<i) != 0
			}
			if has["global"] {
				gg = g
			}
			if has["scene"] {
				ss = sc
			}
			if has["terminal"] {
				tt = tp
			}
			if has["pane"] {
				pp = po
			}
			r := Resolve(gg, ss, tt, pp)
			want := 0
			for k, layers := range layerFields {
				var got *struct {
					origin string
					value  any
				}
				for i := range layers {
					if has[layers[i].origin] {
						got = &layers[i]
					}
				}
				f, ok := r[k]
				if got == nil {
					if ok {
						t.Errorf("%s unexpectedly set: %+v", k, f)
					}
					continue
				}
				want++
				if !ok || f.Origin != got.origin || !reflect.DeepEqual(f.Value, got.value) {
					t.Errorf("%s = %+v, want %v from %s", k, f, got.value, got.origin)
				}
			}
			if len(r) != want {
				t.Errorf("len = %d, want %d: %v", len(r), want, r)
			}
		})
	}
}

func TestResolveEnvAndLists(t *testing.T) {
	tp := &Terminal{Env: map[string]string{"A": "t", "B": "t"},
		PreExec: &Hook{Mode: "all", Run: []string{"t1", "t2"}}}
	po := &Terminal{Env: map[string]string{"B": "p", "C": "p"},
		PreExec: &Hook{Mode: "stop_on_fail", Run: []string{"p1"}}}
	r := Resolve(nil, nil, tp, po)
	for k, o := range map[string]string{"env.A": "terminal", "env.B": "pane", "env.C": "pane", "pre_exec": "pane"} {
		if r[k].Origin != o {
			t.Errorf("%s origin = %s, want %s", k, r[k].Origin, o)
		}
	}
	if want := map[string]any{"mode": "stop_on_fail", "run": []string{"p1"}}; !reflect.DeepEqual(r["pre_exec"].Value, want) {
		t.Errorf("pre_exec = %#v", r["pre_exec"].Value)
	}
	if r := Resolve(nil, nil, tp, nil); r["pre_exec"].Origin != "terminal" {
		t.Errorf("terminal list lost: %v", r["pre_exec"])
	}
}

func TestResolveExplicitFalseFromTOML(t *testing.T) {
	v, err := Decode(KindTerminal, []byte("persistent = false\n[font]\nligatures = false\n[background]\nopacity = 0\nblur = 0\n"))
	if err != nil {
		t.Fatal(err)
	}
	r := Resolve(nil, nil, &Terminal{Persistent: ptr(true)}, v.(*Terminal))
	for _, k := range []string{"persistent", "font.ligatures", "background.opacity", "background.blur"} {
		if r[k].Origin != "pane" {
			t.Errorf("%s = %+v, want pane override", k, r[k])
		}
	}
	if r["persistent"].Value != false {
		t.Errorf("persistent = %v", r["persistent"].Value)
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
