package config

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveGlobalLoadError(t *testing.T) {
	dir := t.TempDir()
	// config.toml as a directory makes ReadFile fail with a non-NotExist error
	if err := os.Mkdir(filepath.Join(dir, "config.toml"), 0o755); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	NewStore(dir).Register(mux)
	if w := call(mux, "GET", "/api/presets/resolve", ""); w.Code != http.StatusInternalServerError {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestResolvePostBodyTooLarge(t *testing.T) {
	mux := newMux(t)
	body := strings.Repeat("a", maxBody+1)
	if w := call(mux, "POST", "/api/presets/resolve", body); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
