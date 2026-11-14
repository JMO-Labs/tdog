package config

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newMux(t *testing.T) *http.ServeMux {
	t.Helper()
	mux := http.NewServeMux()
	NewStore(t.TempDir()).Register(mux)
	return mux
}

func call(mux http.Handler, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(method, path, strings.NewReader(body)))
	return w
}

func TestRoutesCRUD(t *testing.T) {
	mux := newMux(t)
	if w := call(mux, "PUT", "/api/presets/terminal/dev", specExample); w.Code != http.StatusNoContent {
		t.Fatalf("put: %d %s", w.Code, w.Body)
	}
	if w := call(mux, "GET", "/api/presets/terminal/dev", ""); w.Code != 200 || !strings.Contains(w.Body.String(), "npm run dev") {
		t.Fatalf("get: %d %s", w.Code, w.Body)
	}
	if w := call(mux, "GET", "/api/presets/terminal", ""); w.Code != 200 || strings.TrimSpace(w.Body.String()) != `["dev"]` {
		t.Fatalf("list: %d %s", w.Code, w.Body)
	}
	if w := call(mux, "DELETE", "/api/presets/terminal/dev", ""); w.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", w.Code)
	}
	if w := call(mux, "GET", "/api/presets/terminal/dev", ""); w.Code != 404 {
		t.Fatalf("get after delete: %d", w.Code)
	}
	if w := call(mux, "DELETE", "/api/presets/terminal/dev", ""); w.Code != 404 {
		t.Fatalf("delete missing: %d", w.Code)
	}
}

func TestRoutesErrors(t *testing.T) {
	mux := newMux(t)
	w := call(mux, "PUT", "/api/presets/terminal/dev", "font = { sizee = 1 }")
	if w.Code != 400 || !strings.Contains(w.Body.String(), "font.sizee") {
		t.Fatalf("invalid: %d %s", w.Code, w.Body)
	}
	if w := call(mux, "PUT", "/api/presets/terminal/dev", strings.Repeat("#", maxBody+1)); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("big: %d", w.Code)
	}
	if w := call(mux, "GET", "/api/presets/bogus/x", ""); w.Code != 404 {
		t.Fatalf("kind: %d", w.Code)
	}
	if w := call(mux, "GET", "/api/presets/bogus", ""); w.Code != 404 {
		t.Fatalf("kind list: %d", w.Code)
	}
	if w := call(mux, "GET", "/api/presets/global", ""); w.Code != 404 {
		t.Fatalf("global kind: %d", w.Code)
	}
	for _, p := range []string{"/api/presets/terminal/A", "/api/presets/terminal/.x"} {
		for _, m := range []string{"GET", "PUT", "DELETE"} {
			if w := call(mux, m, p, `target = "container"`); w.Code != 400 {
				t.Fatalf("%s %s: %d", m, p, w.Code)
			}
		}
	}
}

func TestSchemaRoute(t *testing.T) {
	mux := newMux(t)
	for _, k := range []string{"global", "terminal", "scene"} {
		w := call(mux, "GET", "/api/schema/"+k, "")
		if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Type"), "json") || !strings.Contains(w.Body.String(), "json-schema.org") {
			t.Fatalf("%s: %d %s", k, w.Code, w.Body)
		}
	}
	if w := call(mux, "GET", "/api/schema/nope", ""); w.Code != 404 {
		t.Fatalf("%d", w.Code)
	}
}
