package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/JMO-Labs/tdog/internal/auth"
	"github.com/JMO-Labs/tdog/internal/config"
)

func TestHealthz(t *testing.T) {
	rec := httptest.NewRecorder()
	New().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}

func TestSecuredRequiresSession(t *testing.T) {
	a, err := auth.New(t.TempDir(), func(string, ...any) {})
	if err != nil {
		t.Fatal(err)
	}
	h := NewSecured(fstest.MapFS{"index.html": {Data: []byte("x")}}, a)
	for _, p := range []string{"/api/anything", "/ws/term", "/api/sessions", "/api/shell"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s: %d", p, rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("/: %d", rec.Code)
	}
}

func TestUnsecuredHasNoTerm(t *testing.T) {
	rec := httptest.NewRecorder()
	NewWithUI(fstest.MapFS{"index.html": {Data: []byte("x")}}).
		ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws/term", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unsecured handler exposes /ws/term: %d", rec.Code)
	}
}

func TestKillRoutesAuthenticated(t *testing.T) {
	a, err := auth.New(t.TempDir(), func(string, ...any) {})
	if err != nil {
		t.Fatal(err)
	}
	h := NewSecured(fstest.MapFS{"index.html": {Data: []byte("x")}}, a)
	for _, p := range []string{"/api/sessions/x/kill", "/api/scenes/x/kill", "/api/sessions/kill-all"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, p, nil))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s: %d", p, rec.Code)
		}
	}
}

func TestPresetRoutesAuthenticated(t *testing.T) {
	a, err := auth.New(t.TempDir(), func(string, ...any) {})
	if err != nil {
		t.Fatal(err)
	}
	h := NewSecuredPresets(fstest.MapFS{"index.html": {Data: []byte("x")}}, a, config.NewStore(t.TempDir()))
	for _, m := range []string{"GET", "PUT", "DELETE"} {
		for _, p := range []string{"/api/presets/terminal", "/api/presets/terminal/x", "/api/schema/terminal"} {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(m, p, nil))
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("%s %s: %d", m, p, rec.Code)
			}
		}
	}
}
