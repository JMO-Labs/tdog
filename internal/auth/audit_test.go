package auth

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
)

func events(a *Auth) []string {
	var out []string
	for _, e := range a.Audit().Recent(100) {
		out = append([]string{e.Event}, out...)
	}
	return out
}

func hasEvents(t *testing.T, a *Auth, want ...string) {
	t.Helper()
	got := events(a)
	if len(got) != len(want) {
		t.Fatalf("events = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("events = %v, want %v", got, want)
		}
	}
}

func TestAuditSetupLoginLogout(t *testing.T) {
	a, h := newTest(t)
	setup(t, a, h)
	do(h, "POST", "/api/login", "localhost", map[string]string{"password": "wrong password"}, nil)
	a.lim = newLimiter(time.Now) // skip the post-failure delay
	c, csrf := login(t, h, "localhost")
	do(h, "POST", "/api/logout", "localhost", nil, func(r *http.Request) {
		r.AddCookie(c)
		r.Header.Set("X-CSRF-Token", csrf)
	})
	hasEvents(t, a, "setup", "login_fail", "login_ok", "logout")
	if ip := a.Audit().Recent(1)[0].IP; ip != "203.0.113.5" {
		t.Fatalf("ip = %q", ip)
	}
}

func TestAuditTOTPChanges(t *testing.T) {
	e := totpEnv(t)
	secret, _ := enroll(t, e)
	*e.clk += 60
	e.a.lim = newLimiter(time.Now)
	do(e.h, "POST", "/api/totp/disable", "localhost",
		map[string]string{"password": pw, "code": totpAt(secret, *e.clk, 6)}, authed(e))
	hasEvents(t, e.a, "setup", "login_ok", "totp_enroll", "totp_disable")
}

func TestRevokeAll(t *testing.T) {
	e := totpEnv(t)
	c2, _ := login(t, e.h, "localhost")
	if do(e.h, "GET", "/api/data", "localhost", nil, func(r *http.Request) { r.AddCookie(c2) }).Code != 200 {
		t.Fatal("second session not valid")
	}
	if do(e.h, "POST", "/api/sessions/revoke-all", "localhost", nil, nil).Code != 401 {
		t.Fatal("revoke-all must be authenticated")
	}
	w := do(e.h, "POST", "/api/sessions/revoke-all", "localhost", nil, authed(e))
	if w.Code != 200 {
		t.Fatalf("revoke-all: %d", w.Code)
	}
	for _, c := range []*http.Cookie{e.c, c2} {
		if do(e.h, "GET", "/api/data", "localhost", nil, func(r *http.Request) { r.AddCookie(c) }).Code != 401 {
			t.Fatal("session survived revoke-all")
		}
	}
	if ev := e.a.Audit().Recent(1)[0].Event; ev != "sessions_revoke_all" {
		t.Fatalf("last event %q", ev)
	}
}

func TestAuditEndpoint(t *testing.T) {
	e := totpEnv(t)
	if do(e.h, "GET", "/api/audit", "localhost", nil, nil).Code != 401 {
		t.Fatal("audit must be authenticated")
	}
	w := do(e.h, "GET", "/api/audit?limit=1", "localhost", nil, authed(e))
	var out []audit.Entry
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil || len(out) != 1 || out[0].Event != "login_ok" {
		t.Fatalf("audit: %d %s", w.Code, w.Body)
	}
}
