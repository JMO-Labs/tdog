package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func uiFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":    {Data: []byte("<html>app</html>")},
		"assets/app.js": {Data: []byte("console.log(1)")},
		"assets/a.css":  {Data: []byte("body{}")},
	}
}

func get(h http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestUIIndex(t *testing.T) {
	rec := get(NewWithUI(uiFS()), "/")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "app") {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("content-type %q", ct)
	}
}

func TestUIAsset(t *testing.T) {
	h := NewWithUI(uiFS())
	rec := get(h, "/assets/app.js")
	if rec.Code != 200 || rec.Body.String() != "console.log(1)" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "javascript") {
		t.Fatalf("js content-type %q", ct)
	}
	if ct := get(h, "/assets/a.css").Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/css") {
		t.Fatalf("css content-type %q", ct)
	}
}

func TestUIFallback(t *testing.T) {
	h := NewWithUI(uiFS())
	rec := get(h, "/some/spa/route")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "app") {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	if get(h, "/healthz").Body.String() != "ok" {
		t.Fatal("healthz broken")
	}
	for _, p := range []string{"/api/nope", "/ws/x"} {
		if c := get(h, p).Code; c != http.StatusNotFound {
			t.Fatalf("%s: got %d want 404", p, c)
		}
	}
	if c := get(h, "/assets/missing.js").Code; c != http.StatusNotFound {
		t.Fatalf("missing asset: got %d", c)
	}
}

func TestUIPlaceholderWhenNoBuild(t *testing.T) {
	rec := get(NewWithUI(fstest.MapFS{".gitkeep": {}}), "/")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "not built") {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}
