package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/JMO-Labs/tdog/internal/auth"
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
	for _, p := range []string{"/api/anything", "/ws/term"} {
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
