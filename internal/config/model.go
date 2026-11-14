// Package config is tdog's TOML preset store (spec §7): typed models,
// strict validation with field paths, and atomic file-backed CRUD.
package config

import "fmt"

// Preset kinds. KindGlobal is config.toml; the others live under presets/.
const (
	KindGlobal   = "global"
	KindTerminal = "terminal"
	KindScene    = "scene"
)

// ValidationError names the offending field (dotted path, "" for syntax errors).
type ValidationError struct{ Path, Msg string }

func (e *ValidationError) Error() string {
	if e.Path == "" {
		return e.Msg
	}
	return e.Path + ": " + e.Msg
}

func verr(path, format string, a ...any) *ValidationError {
	return &ValidationError{Path: path, Msg: fmt.Sprintf(format, a...)}
}

// Font, Background and Hook are shared building blocks.
type Font struct {
	Family    string `toml:"family,omitempty" json:"family,omitempty"`
	Size      int    `toml:"size,omitempty" json:"size,omitempty"`
	Ligatures *bool  `toml:"ligatures,omitempty" json:"ligatures,omitempty"`
}

type Background struct {
	Kind    string   `toml:"kind,omitempty" json:"kind,omitempty"`
	Ref     string   `toml:"ref,omitempty" json:"ref,omitempty"`
	Opacity *float64 `toml:"opacity,omitempty" json:"opacity,omitempty"`
	Blur    *int     `toml:"blur,omitempty" json:"blur,omitempty"`
}

// Terminal is a terminal preset.
type Terminal struct {
	Name       string            `toml:"name,omitempty"`
	Target     string            `toml:"target,omitempty"`
	Cwd        string            `toml:"cwd,omitempty"`
	Env        map[string]string `toml:"env,omitempty"`
	Persistent *bool             `toml:"persistent,omitempty"`
	PreExec    *Hook             `toml:"pre_exec,omitempty"`
	Command    string            `toml:"command,omitempty"`
	PostExec   *Hook             `toml:"post_exec,omitempty"`
	OnClose    *Hook             `toml:"on_close,omitempty"`
	Theme      string            `toml:"theme,omitempty"`
	Font       *Font             `toml:"font,omitempty"`
	Background *Background       `toml:"background,omitempty"`
}

// Pane places a terminal preset (by slug) in a scene, with optional overrides.
type Pane struct {
	ID       string    `toml:"id,omitempty"`
	Preset   string    `toml:"preset,omitempty"`
	Override *Terminal `toml:"override,omitempty"`
}

// Scene is a scene preset. Layout is the opaque layout tree.
type Scene struct {
	Name       string         `toml:"name,omitempty"`
	Autostart  bool           `toml:"autostart,omitempty"`
	Theme      string         `toml:"theme,omitempty"`
	Background *Background    `toml:"background,omitempty"`
	Layout     map[string]any `toml:"layout,omitempty"`
	Panes      []Pane         `toml:"panes,omitempty"`
}

// Global is config.toml: the root of the inheritance chain.
type Global struct {
	DefaultTarget string      `toml:"default_target,omitempty"`
	Theme         string      `toml:"theme,omitempty"`
	Font          *Font       `toml:"font,omitempty"`
	Background    *Background `toml:"background,omitempty"`
}
