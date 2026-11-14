package auth

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestRFC6238Vectors(t *testing.T) {
	secret := []byte("12345678901234567890")
	for ts, want := range map[int64]string{
		59: "94287082", 1111111109: "07081804", 1111111111: "14050471",
		1234567890: "89005924", 2000000000: "69279037", 20000000000: "65353130",
	} {
		if got := totpAt(secret, ts, 8); got != want {
			t.Errorf("t=%d: got %s want %s", ts, got, want)
		}
	}
}

func TestMatchSkewAndReplay(t *testing.T) {
	s := []byte("12345678901234567890")
	now := int64(1111111109)
	code := totpAt(s, now, totpDigits)
	for _, d := range []int64{-30, 0, 30} {
		if _, ok := matchTOTP(s, totpAt(s, now+d, totpDigits), now, -1); !ok {
			t.Errorf("skew %d rejected", d)
		}
	}
	if _, ok := matchTOTP(s, totpAt(s, now+60, totpDigits), now, -1); ok {
		t.Error("skew 2 steps accepted")
	}
	step, ok := matchTOTP(s, code, now, -1)
	if !ok {
		t.Fatal("valid code rejected")
	}
	if _, ok := matchTOTP(s, code, now, step); ok {
		t.Error("replay accepted")
	}
}

type env struct {
	a    *Auth
	h    http.Handler
	c    *http.Cookie
	csrf string
	clk  *int64
}

func totpEnv(t *testing.T) *env {
	t.Helper()
	a, h := newTest(t)
	setup(t, a, h)
	clk := int64(1_700_000_000)
	a.now = func() time.Time { return time.Unix(clk, 0) }
	c, csrf := login(t, h, "localhost")
	return &env{a, h, c, csrf, &clk}
}

func enroll(t *testing.T, e *env) (secret []byte, codes []string) {
	t.Helper()
	w := do(e.h, "POST", "/api/totp/enroll", "localhost", nil, func(r *http.Request) {
		r.AddCookie(e.c)
		r.Header.Set("X-CSRF-Token", e.csrf)
	})
	var out struct{ Secret, URI string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
		t.Fatalf("enroll: %d %s", w.Code, w.Body)
	}
	if !strings.HasPrefix(out.URI, "otpauth://totp/") || !strings.Contains(out.URI, "secret="+out.Secret) {
		t.Fatalf("uri: %s", out.URI)
	}
	secret, _ = b32.DecodeString(out.Secret)
	w = do(e.h, "POST", "/api/totp/confirm", "localhost", map[string]string{"code": totpAt(secret, *e.clk, 6)}, func(r *http.Request) {
		r.AddCookie(e.c)
		r.Header.Set("X-CSRF-Token", e.csrf)
	})
	var rc struct {
		RecoveryCodes []string `json:"recovery_codes"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &rc) != nil || len(rc.RecoveryCodes) != 10 {
		t.Fatalf("confirm: %d %s", w.Code, w.Body)
	}
	return secret, rc.RecoveryCodes
}

func loginCode(e *env, code string) int {
	e.a.lim = newLimiter(time.Now) // isolate from lockout
	return do(e.h, "POST", "/api/login", "localhost", map[string]string{"password": pw, "code": code}, nil).Code
}

func TestEnrollConfirmBadCode(t *testing.T) {
	e := totpEnv(t)
	do(e.h, "POST", "/api/totp/enroll", "localhost", nil, func(r *http.Request) {
		r.AddCookie(e.c)
		r.Header.Set("X-CSRF-Token", e.csrf)
	})
	w := do(e.h, "POST", "/api/totp/confirm", "localhost", map[string]string{"code": "000000"}, func(r *http.Request) {
		r.AddCookie(e.c)
		r.Header.Set("X-CSRF-Token", e.csrf)
	})
	if w.Code != 401 || e.a.totp.enabled() {
		t.Fatalf("bad confirm: %d enabled=%v", w.Code, e.a.totp.enabled())
	}
}

func TestLoginRequiresCodeReplayAndRecovery(t *testing.T) {
	e := totpEnv(t)
	secret, codes := enroll(t, e)
	if got := loginCode(e, ""); got != 401 {
		t.Fatalf("no code: %d", got)
	}
	*e.clk += 60
	code := totpAt(secret, *e.clk, 6)
	if got := loginCode(e, code); got != 200 {
		t.Fatalf("valid: %d", got)
	}
	if got := loginCode(e, code); got != 401 {
		t.Fatalf("replay: %d", got)
	}
	if got := loginCode(e, codes[0]); got != 200 {
		t.Fatalf("recovery: %d", got)
	}
	if got := loginCode(e, codes[0]); got != 401 {
		t.Fatalf("recovery reuse: %d", got)
	}
	// stored hashed
	for _, r := range e.a.totp.f.Recovery {
		if strings.Contains(r, "-") || r == normRecovery(codes[1]) {
			t.Fatal("recovery codes not hashed")
		}
	}
}

func TestPersistenceAcrossRestart(t *testing.T) {
	e := totpEnv(t)
	enroll(t, e)
	a2, err := New(e.a.dir, func(string, ...any) {})
	if err != nil || !a2.totp.enabled() || a2.totp.f.LastStep == 0 {
		t.Fatalf("reload: %v", err)
	}
}

func TestSessionInfo(t *testing.T) {
	e := totpEnv(t)
	get := func(host string) (out struct {
		TOTP   bool `json:"totp_enabled"`
		Remote bool `json:"remote"`
	}) {
		w := do(e.h, "GET", "/api/session", host, nil, func(r *http.Request) { r.AddCookie(e.c) })
		if w.Code != 200 {
			t.Fatalf("session: %d", w.Code)
		}
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return
	}
	if o := get("localhost"); o.TOTP || o.Remote {
		t.Fatalf("%+v", o)
	}
	if o := get("example.com"); !o.Remote {
		t.Fatalf("%+v", o)
	}
	if do(e.h, "GET", "/api/session", "localhost", nil, nil).Code != 401 {
		t.Fatal("session must require auth")
	}
	enroll(t, e)
	if !get("localhost").TOTP {
		t.Fatal("totp_enabled false after enroll")
	}
}

func TestDisableNeedsPasswordAndCode(t *testing.T) {
	e := totpEnv(t)
	secret, _ := enroll(t, e)
	*e.clk += 60
	code := totpAt(secret, *e.clk, 6)
	dis := func(body map[string]string) int {
		e.a.lim = newLimiter(time.Now)
		return do(e.h, "POST", "/api/totp/disable", "localhost", body, func(r *http.Request) {
			r.AddCookie(e.c)
			r.Header.Set("X-CSRF-Token", e.csrf)
		}).Code
	}
	if dis(map[string]string{"password": "wrong password", "code": code}) != 401 {
		t.Fatal("bad password accepted")
	}
	if dis(map[string]string{"password": pw, "code": "000000"}) != 401 {
		t.Fatal("bad code accepted")
	}
	if dis(map[string]string{"password": pw, "code": code}) != 200 || e.a.totp.enabled() {
		t.Fatal("disable failed")
	}
	if loginCode(e, "") != 200 {
		t.Fatal("login should not need code after disable")
	}
}
