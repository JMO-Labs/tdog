package schema

import (
	"strings"
	"testing"
)

func TestGet(t *testing.T) {
	for _, k := range []string{"global", "terminal", "scene"} {
		b, ok := Get(k)
		if !ok || !strings.Contains(string(b), "json-schema.org") {
			t.Fatalf("%s: ok=%v", k, ok)
		}
	}
	for _, k := range []string{"", "nope", "../global", "global.schema.json"} {
		if b, ok := Get(k); ok || b != nil {
			t.Fatalf("%q must be unknown", k)
		}
	}
}
