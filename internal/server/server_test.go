package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthz(t *testing.T) {
	rec := httptest.NewRecorder()
	New(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}

func TestTermRequiresAuth(t *testing.T) {
	req := func(h http.Handler) int {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws/term", nil))
		return rec.Code
	}
	if c := req(New(nil)); c != http.StatusNotFound {
		t.Fatalf("no auth configured: got %d, want 404", c)
	}
	deny := New(func(*http.Request) bool { return false })
	if c := req(deny); c != http.StatusUnauthorized {
		t.Fatalf("denied: got %d, want 401", c)
	}
}
