package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const pw = "correct horse battery"

func newTest(t *testing.T) (*Auth, http.Handler) {
	t.Helper()
	a, err := New(t.TempDir(), func(string, ...any) {})
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	a.Register(mux)
	mux.HandleFunc("POST /api/act", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("done")) })
	mux.HandleFunc("GET /api/data", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("data")) })
	mux.HandleFunc("GET /ws/term", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ws")) })
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	mux.HandleFunc("GET /", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ui")) })
	return a, a.Middleware(mux)
}

func do(h http.Handler, method, path, host string, body any, mod func(*http.Request)) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	r := httptest.NewRequest(method, "http://"+host+path, &buf)
	r.RemoteAddr = "203.0.113.5:1234"
	if mod != nil {
		mod(r)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func setup(t *testing.T, a *Auth, h http.Handler) {
	t.Helper()
	w := do(h, "POST", "/api/setup", "localhost", map[string]string{"token": a.setupToken, "password": pw}, nil)
	if w.Code != 200 {
		t.Fatalf("setup: %d %s", w.Code, w.Body)
	}
}

func login(t *testing.T, h http.Handler, host string) (*http.Cookie, string) {
	t.Helper()
	w := do(h, "POST", "/api/login", host, map[string]string{"password": pw}, nil)
	if w.Code != 200 {
		t.Fatalf("login: %d %s", w.Code, w.Body)
	}
	var out struct{ CSRF string }
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	c := w.Result().Cookies()
	if len(c) != 1 {
		t.Fatalf("cookies: %v", c)
	}
	return c[0], out.CSRF
}

func TestSetupOnceAndTokenSingleUse(t *testing.T) {
	a, h := newTest(t)
	if a.setupToken == "" {
		t.Fatal("no setup token on first run")
	}
	bad := do(h, "POST", "/api/setup", "localhost", map[string]string{"token": "nope", "password": pw}, nil)
	if bad.Code != http.StatusForbidden {
		t.Fatalf("bad token: %d", bad.Code)
	}
	tok := a.setupToken
	setup(t, a, h)
	again := do(h, "POST", "/api/setup", "localhost", map[string]string{"token": tok, "password": "another password"}, nil)
	if again.Code != http.StatusConflict {
		t.Fatalf("second setup: %d", again.Code)
	}
	// persisted hash is Argon2id; a restart sees the user and issues no token
	a2, err := New(a.dir, func(string, ...any) {})
	if err != nil || a2.setupToken != "" || !strings.HasPrefix(a2.hash, "argon2id$") {
		t.Fatalf("reload: %v tok=%q hash=%q", err, a2.setupToken, a2.hash)
	}
}

func TestLoginOKBadAndCookieFlags(t *testing.T) {
	a, h := newTest(t)
	setup(t, a, h)
	if w := do(h, "POST", "/api/login", "example.com", map[string]string{"password": "wrong"}, nil); w.Code != 401 {
		t.Fatalf("bad login: %d", w.Code)
	}
	a.lim = newLimiter(time.Now) // reset delay from the failure
	c, _ := login(t, h, "example.com")
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteStrictMode || c.MaxAge != 12*3600 {
		t.Fatalf("flags: %+v", c)
	}
	a.lim = newLimiter(time.Now)
	c, _ = login(t, h, "localhost:7681")
	if c.Secure {
		t.Fatal("cookie must not be Secure on localhost")
	}
}

func TestUnauthenticatedRejected(t *testing.T) {
	a, h := newTest(t)
	setup(t, a, h)
	for _, p := range []string{"/api/data", "/ws/term"} {
		if w := do(h, "GET", p, "localhost", nil, nil); w.Code != 401 {
			t.Fatalf("%s: %d", p, w.Code)
		}
	}
	for _, p := range []string{"/healthz", "/", "/assets/app.js"} {
		if w := do(h, "GET", p, "localhost", nil, nil); w.Code != 200 && w.Code != 404 {
			t.Fatalf("%s should be public: %d", p, w.Code)
		}
	}
	if w := do(h, "GET", "/healthz", "localhost", nil, nil); w.Code != 200 {
		t.Fatal("healthz")
	}
}

func TestWSOriginAndSession(t *testing.T) {
	a, h := newTest(t)
	setup(t, a, h)
	c, _ := login(t, h, "localhost")
	ws := func(origin string) int {
		return do(h, "GET", "/ws/term", "localhost", nil, func(r *http.Request) {
			r.AddCookie(c)
			r.Header.Set("Upgrade", "websocket")
			r.Header.Set("Connection", "Upgrade")
			if origin != "" {
				r.Header.Set("Origin", origin)
			}
		}).Code
	}
	if got := ws("http://localhost"); got != 200 {
		t.Fatalf("same origin: %d", got)
	}
	if got := ws("http://evil.example"); got != 403 {
		t.Fatalf("origin mismatch: %d", got)
	}
	if got := ws(""); got != 403 {
		t.Fatalf("missing origin: %d", got)
	}
}

func TestCSRFOnStateChanging(t *testing.T) {
	a, h := newTest(t)
	setup(t, a, h)
	c, csrf := login(t, h, "localhost")
	post := func(tok string) int {
		return do(h, "POST", "/api/act", "localhost", nil, func(r *http.Request) {
			r.AddCookie(c)
			if tok != "" {
				r.Header.Set("X-CSRF-Token", tok)
			}
		}).Code
	}
	if post("") != 403 || post("wrong") != 403 {
		t.Fatal("missing/wrong csrf must be rejected")
	}
	if post(csrf) != 200 {
		t.Fatal("valid csrf rejected")
	}
	if do(h, "GET", "/api/data", "localhost", nil, func(r *http.Request) { r.AddCookie(c) }).Code != 200 {
		t.Fatal("GET with session")
	}
}

func TestLogoutAndIdleExpiry(t *testing.T) {
	a, h := newTest(t)
	setup(t, a, h)
	now := time.Now()
	a.sessions.now = func() time.Time { return now }
	c, csrf := login(t, h, "localhost")
	now = now.Add(13 * time.Hour)
	if do(h, "GET", "/api/data", "localhost", nil, func(r *http.Request) { r.AddCookie(c) }).Code != 401 {
		t.Fatal("idle session should expire")
	}
	a.lim = newLimiter(time.Now)
	c, csrf = login(t, h, "localhost")
	w := do(h, "POST", "/api/logout", "localhost", nil, func(r *http.Request) {
		r.AddCookie(c)
		r.Header.Set("X-CSRF-Token", csrf)
	})
	if w.Code != 200 {
		t.Fatalf("logout: %d", w.Code)
	}
	if do(h, "GET", "/api/data", "localhost", nil, func(r *http.Request) { r.AddCookie(c) }).Code != 401 {
		t.Fatal("session survives logout")
	}
}

func TestProgressiveDelay(t *testing.T) {
	now := time.Unix(1000, 0)
	l := newLimiter(func() time.Time { return now })
	if l.wait("ip") != 0 {
		t.Fatal("fresh ip delayed")
	}
	l.fail("ip")
	w1 := l.wait("ip")
	l.fail("ip")
	w2 := l.wait("ip")
	if w1 <= 0 || w2 != 2*w1 {
		t.Fatalf("doubling: %v %v", w1, w2)
	}
	for i := 0; i < 40; i++ {
		l.fail("ip")
	}
	if l.wait("ip") != l.max {
		t.Fatalf("cap: %v", l.wait("ip"))
	}
	if l.wait("other") != 0 {
		t.Fatal("per-ip")
	}
	l.ok("ip")
	if l.wait("ip") != 0 {
		t.Fatal("reset on success")
	}
}

func TestLoginThrottled(t *testing.T) {
	a, h := newTest(t)
	setup(t, a, h)
	do(h, "POST", "/api/login", "localhost", map[string]string{"password": "x"}, nil)
	w := do(h, "POST", "/api/login", "localhost", map[string]string{"password": pw}, nil)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("throttle: %d", w.Code)
	}
}
