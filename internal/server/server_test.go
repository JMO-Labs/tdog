package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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

func TestFontRoutesAuthenticated(t *testing.T) {
	a, err := auth.New(t.TempDir(), func(string, ...any) {})
	if err != nil {
		t.Fatal(err)
	}
	h := NewSecuredPresets(fstest.MapFS{"index.html": {Data: []byte("x")}}, a, config.NewStore(t.TempDir()))
	for _, c := range [][2]string{
		{"GET", "/api/fonts"}, {"GET", "/api/fonts.css"}, {"GET", "/api/fonts/files/x.ttf"},
		{"POST", "/api/fonts"}, {"DELETE", "/api/fonts/x"}, {"POST", "/api/fonts/nerd"}, {"POST", "/api/fonts/google"},
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(c[0], c[1], nil))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: %d", c[0], c[1], rec.Code)
		}
	}
}

func TestJournalRoutesRequireSession(t *testing.T) {
	a, err := auth.New(t.TempDir(), func(string, ...any) {})
	if err != nil {
		t.Fatal(err)
	}
	h := NewSecuredPresets(fstest.MapFS{"index.html": {Data: []byte("x")}}, a, config.NewStore(t.TempDir()))
	for _, c := range [][2]string{{http.MethodGet, "/api/journal?since=0"}, {http.MethodPut, "/api/journal/settings"}} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(c[0], c[1], strings.NewReader(`{"retentionHours":12}`)))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: %d", c[0], c[1], rec.Code)
		}
	}
}

func TestJournalSettingsRejectsMissingCSRF(t *testing.T) {
	var tok string
	a, err := auth.New(t.TempDir(), func(f string, args ...any) {
		if len(args) == 1 {
			tok, _ = args[0].(string)
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	h := NewSecuredPresets(fstest.MapFS{"index.html": {Data: []byte("x")}}, a, config.NewStore(t.TempDir()))
	do := func(path, body string, mod func(*http.Request)) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "http://localhost"+path, strings.NewReader(body))
		r.RemoteAddr = "203.0.113.5:1234"
		r.Header.Set("Content-Type", "application/json")
		if mod != nil {
			mod(r)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		return rec
	}
	if c := do("/api/setup", `{"token":"`+tok+`","password":"correct horse battery"}`, nil).Code; c != 200 {
		t.Fatalf("setup %d", c)
	}
	login := do("/api/login", `{"password":"correct horse battery"}`, nil)
	var out struct{ CSRF string }
	_ = json.Unmarshal(login.Body.Bytes(), &out)
	ck := login.Result().Cookies()
	if login.Code != 200 || len(ck) != 1 || out.CSRF == "" {
		t.Fatalf("login %d", login.Code)
	}
	put := func(tok string) int {
		return do("/api/journal/settings", `{"retentionHours":12}`, func(r *http.Request) {
			r.Method = http.MethodPut
			r.AddCookie(ck[0])
			if tok != "" {
				r.Header.Set("X-CSRF-Token", tok)
			}
		}).Code
	}
	if c := put(""); c != http.StatusForbidden {
		t.Fatalf("no csrf: %d", c)
	}
	if c := put(out.CSRF); c != http.StatusNoContent {
		t.Fatalf("with csrf: %d", c)
	}
}

func TestMain(m *testing.M) {
	ctx, cancel := context.WithCancel(context.Background())
	journalCtx = ctx // stop every sweep goroutine the tests start
	code := m.Run()
	cancel()
	os.Exit(code)
}
