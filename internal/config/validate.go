package config

import (
	"errors"
	"fmt"
	"strings"

	"github.com/BurntSushi/toml"
)

var (
	targets    = map[string]bool{"ssh-host": true, "container": true, "nsenter": true}
	bgKinds    = map[string]bool{"none": true, "color": true, "image": true, "shader": true}
	hookFields = map[string]bool{"pre_exec": true, "post_exec": true, "on_close": true}
	newValue   = map[string]func() any{
		KindGlobal:   func() any { return new(Global) },
		KindTerminal: func() any { return new(Terminal) },
		KindScene:    func() any { return new(Scene) },
	}
)

// Decode parses and strictly validates data as the given kind.
func Decode(kind string, data []byte) (any, error) {
	mk, ok := newValue[kind]
	if !ok {
		return nil, ErrBadKind
	}
	v := mk()
	md, err := toml.Decode(string(data), v)
	if err != nil {
		var pe toml.ParseError
		if errors.As(err, &pe) {
			return nil, &ValidationError{Path: pe.LastKey, Msg: pe.Message}
		}
		return nil, &ValidationError{Msg: err.Error()}
	}
	for _, k := range md.Undecoded() {
		if !insideHook(k) {
			return nil, verr(k.String(), "unknown key")
		}
	}
	var ve *ValidationError
	switch t := v.(type) {
	case *Global:
		ve = t.validate()
	case *Terminal:
		ve = t.validate("")
	case *Scene:
		ve = t.validate()
	}
	if ve != nil {
		return nil, ve
	}
	return v, nil
}

// insideHook: hook tables are decoded by Hook itself, which checks its keys.
func insideHook(k toml.Key) bool {
	for i := 0; i < len(k)-1; i++ {
		if hookFields[k[i]] {
			return true
		}
	}
	return false
}

func join(prefix, f string) string { return prefix + f }

func (f *Font) validate(path string) *ValidationError {
	if f != nil && f.Size != 0 && (f.Size < 6 || f.Size > 72) {
		return verr(path+".size", "must be between 6 and 72")
	}
	return nil
}

func (b *Background) validate(path string) *ValidationError {
	if b == nil {
		return nil
	}
	if b.Kind != "" && !bgKinds[b.Kind] {
		return verr(path+".kind", "must be one of none, color, image, shader")
	}
	if b.Opacity != nil && (*b.Opacity < 0 || *b.Opacity > 1) {
		return verr(path+".opacity", "must be between 0 and 1")
	}
	if b.Blur != nil && (*b.Blur < 0 || *b.Blur > 100) {
		return verr(path+".blur", "must be between 0 and 100")
	}
	return nil
}

func checkTarget(path, t string) *ValidationError {
	if t != "" && !targets[t] {
		return verr(path, "must be one of ssh-host, container, nsenter")
	}
	return nil
}

func (g *Global) validate() *ValidationError {
	if e := checkTarget("default_target", g.DefaultTarget); e != nil {
		return e
	}
	if e := g.Font.validate("font"); e != nil {
		return e
	}
	return g.Background.validate("background")
}

// validate checks a terminal preset; prefix is "" or "panes[i].override.".
func (t *Terminal) validate(prefix string) *ValidationError {
	if e := checkTarget(join(prefix, "target"), t.Target); e != nil {
		return e
	}
	for k := range t.Env {
		if k == "" || strings.ContainsAny(k, "=\x00") {
			return verr(join(prefix, "env"), "invalid variable name %q", k)
		}
	}
	for _, h := range []struct {
		n string
		h *Hook
	}{{"pre_exec", t.PreExec}, {"post_exec", t.PostExec}, {"on_close", t.OnClose}} {
		if e := h.h.validate(join(prefix, h.n)); e != nil {
			return e
		}
	}
	if e := t.Font.validate(join(prefix, "font")); e != nil {
		return e
	}
	return t.Background.validate(join(prefix, "background"))
}

func (s *Scene) validate() *ValidationError {
	if e := s.Background.validate("background"); e != nil {
		return e
	}
	slots := map[string]bool{}
	for _, p := range s.Panes {
		if p.ID != "" {
			slots[p.ID] = true
		}
	}
	if s.Layout != nil {
		if e := s.Layout.validate("layout", slots, map[string]bool{}); e != nil {
			return e
		}
	}
	for i, p := range s.Panes {
		pre := fmt.Sprintf("panes[%d]", i)
		if p.Preset != "" && !validName(p.Preset) {
			return verr(pre+".preset", "invalid preset name")
		}
		if p.Override != nil {
			if e := p.Override.validate(pre + ".override."); e != nil {
				return e
			}
		}
	}
	return nil
}
