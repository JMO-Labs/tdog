package config

import "sort"

// Origin layers of the inheritance chain (spec §7), lowest to highest priority.
const (
	OriginGlobal   = "global"
	OriginScene    = "scene"
	OriginTerminal = "terminal"
	OriginPane     = "pane"
)

// Field is one resolved value and the layer it came from.
type Field struct {
	Value  any    `json:"value"`
	Origin string `json:"origin"`
}

// Resolved maps dotted field paths ("font.size", "env.NODE_ENV") to fields.
type Resolved map[string]Field

// Resolve merges global → scene → terminal → pane override; any layer may be
// nil. Strings and sizes override when non-empty; bools and numbers
// (persistent, ligatures, opacity, blur) override whenever explicitly set, so
// false/0 beats a lower layer. Sub-fields override individually, env maps merge per key,
// hooks (lists) replace wholesale.
func Resolve(g *Global, s *Scene, t, pane *Terminal) Resolved {
	r := Resolved{}
	if g != nil {
		r.layer(OriginGlobal, &Terminal{Target: g.DefaultTarget, Theme: g.Theme, Font: g.Font, Background: g.Background})
	}
	if s != nil {
		r.layer(OriginScene, &Terminal{Theme: s.Theme, Background: s.Background})
	}
	r.layer(OriginTerminal, t)
	r.layer(OriginPane, pane)
	return r
}

func (r Resolved) set(path, origin string, v any) { r[path] = Field{Value: v, Origin: origin} }

func (r Resolved) layer(origin string, t *Terminal) {
	if t == nil {
		return
	}
	str := func(path, v string) {
		if v != "" {
			r.set(path, origin, v)
		}
	}
	str("target", t.Target)
	str("cwd", t.Cwd)
	str("command", t.Command)
	str("theme", t.Theme)
	if t.Persistent != nil {
		r.set("persistent", origin, *t.Persistent)
	}
	keys := make([]string, 0, len(t.Env))
	for k := range t.Env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		r.set("env."+k, origin, t.Env[k])
	}
	for path, h := range map[string]*Hook{"pre_exec": t.PreExec, "post_exec": t.PostExec, "on_close": t.OnClose} {
		if h != nil {
			r.set(path, origin, map[string]any{"mode": h.Mode, "run": h.Run})
		}
	}
	if f := t.Font; f != nil {
		str("font.family", f.Family)
		if f.Size != 0 {
			r.set("font.size", origin, f.Size)
		}
		if f.Ligatures != nil {
			r.set("font.ligatures", origin, *f.Ligatures)
		}
	}
	if b := t.Background; b != nil {
		str("background.kind", b.Kind)
		str("background.ref", b.Ref)
		if b.Opacity != nil {
			r.set("background.opacity", origin, *b.Opacity)
		}
		if b.Blur != nil {
			r.set("background.blur", origin, *b.Blur)
		}
	}
}
