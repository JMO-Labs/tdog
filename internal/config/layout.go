package config

// Layout is the renderer-agnostic layout tree of a scene preset: binary
// splits with a ratio, and pane slots that name a Scene.Panes[].ID. It is
// independent of the web renderer's internal state (see web/src/layout/sceneLayout.ts).
type Layout struct {
	Type  string  `toml:"type" json:"type"` // "pane" | "split"
	Pane  string  `toml:"pane,omitempty" json:"pane,omitempty"`
	Dir   string  `toml:"dir,omitempty" json:"dir,omitempty"` // "row" | "col"
	Ratio float64 `toml:"ratio,omitempty" json:"ratio,omitempty"`
	A     *Layout `toml:"a,omitempty" json:"a,omitempty"`
	B     *Layout `toml:"b,omitempty" json:"b,omitempty"`
}

// validate checks the tree rooted at l; path is the dotted field path.
// slots are the pane ids declared by the scene; seen tracks used slots.
func (l *Layout) validate(path string, slots, seen map[string]bool) *ValidationError {
	switch l.Type {
	case "pane":
		if !slots[l.Pane] {
			return verr(path+".pane", "unknown pane %q", l.Pane)
		}
		if seen[l.Pane] {
			return verr(path+".pane", "pane %q used twice", l.Pane)
		}
		seen[l.Pane] = true
	case "split":
		if l.Dir != "row" && l.Dir != "col" {
			return verr(path+".dir", "must be row or col")
		}
		if l.Ratio < 0.1 || l.Ratio > 0.9 {
			return verr(path+".ratio", "must be between 0.1 and 0.9")
		}
		if l.A == nil || l.B == nil {
			return verr(path, "split needs a and b")
		}
		if e := l.A.validate(path+".a", slots, seen); e != nil {
			return e
		}
		return l.B.validate(path+".b", slots, seen)
	default:
		return verr(path+".type", "must be pane or split")
	}
	return nil
}
