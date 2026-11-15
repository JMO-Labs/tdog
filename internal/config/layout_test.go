package config

import (
	"strings"
	"testing"
)

const sceneToml = `
name = "dev"
autostart = true
[layout]
type = "split"
dir = "row"
ratio = 0.4
[layout.a]
type = "pane"
pane = "ed"
[layout.b]
type = "pane"
pane = "sh"
[[panes]]
id = "ed"
preset = "editor"
[[panes]]
id = "sh"
preset = "shell"
`

func TestSceneLayoutDecodes(t *testing.T) {
	v, err := Decode(KindScene, []byte(sceneToml))
	if err != nil {
		t.Fatal(err)
	}
	l := v.(*Scene).Layout
	if l.Type != "split" || l.Dir != "row" || l.Ratio != 0.4 || l.A.Pane != "ed" || l.B.Pane != "sh" {
		t.Fatalf("layout: %+v", l)
	}
}

func TestSceneLayoutInvalid(t *testing.T) {
	cases := map[string]string{
		"layout.type":   strings.Replace(sceneToml, `type = "split"`, `type = "grid"`, 1),
		"layout.dir":    strings.Replace(sceneToml, `dir = "row"`, `dir = "diag"`, 1),
		"layout.ratio":  strings.Replace(sceneToml, `ratio = 0.4`, `ratio = 1.5`, 1),
		"layout.a.pane": strings.Replace(sceneToml, `pane = "ed"`, `pane = "nope"`, 1),
		"layout.b.pane": strings.Replace(sceneToml, `pane = "sh"`, `pane = "ed"`, 1),
	}
	for path, src := range cases {
		_, err := Decode(KindScene, []byte(src))
		ve, ok := err.(*ValidationError)
		if !ok || ve.Path != path {
			t.Fatalf("%s: got %v", path, err)
		}
	}
}

func TestSceneLayoutSplitNeedsChildren(t *testing.T) {
	src := "[layout]\ntype = \"split\"\ndir = \"row\"\nratio = 0.5\n"
	if _, err := Decode(KindScene, []byte(src)); err == nil {
		t.Fatal("split without children accepted")
	}
}
