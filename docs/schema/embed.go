// Package schema embeds the published JSON Schemas for tdog presets.
package schema

import "embed"

//go:embed global.schema.json terminal.schema.json scene.schema.json
var files embed.FS

// Get returns the JSON Schema for kind (global, terminal or scene).
func Get(kind string) ([]byte, bool) {
	switch kind {
	case "global", "terminal", "scene":
		b, err := files.ReadFile(kind + ".schema.json")
		return b, err == nil
	}
	return nil, false
}
