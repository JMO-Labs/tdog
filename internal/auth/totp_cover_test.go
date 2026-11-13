package auth

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func authed(e *env) func(*http.Request) {
	return func(r *http.Request) {
		r.AddCookie(e.c)
		r.Header.Set("X-CSRF-Token", e.csrf)
	}
}

// badDir returns a directory path that cannot be created (parent is a file).
func badDir(t *testing.T) string {
	t.Helper()
	f := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(f, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	return filepath.Join(f, "sub")
}

func TestLoadTOTPErrors(t *testing.T) {
	dir := t.TempDir()
	_ = os.Mkdir(filepath.Join(dir, "totp.json"), 0o700) // a directory, not a file
	if _, err := loadTOTP(dir); err == nil {
		t.Fatal("unreadable totp.json: want error")
	}
	if _, err := New(dir, func(string, ...any) {}); err == nil {
		t.Fatal("New with unreadable totp.json: want error")
	}
	bad := t.TempDir()
	_ = os.WriteFile(filepath.Join(bad, "totp.json"), []byte("{bad"), 0o600)
	if _, err := loadTOTP(bad); err == nil {
		t.Fatal("corrupt totp.json: want error")
	}
}

func TestSaveErrors(t *testing.T) {
	// removal fails: totp.json is a non-empty directory
	d := t.TempDir()
	_ = os.MkdirAll(filepath.Join(d, "totp.json", "x"), 0o700)
	if err := (&totpState{dir: d}).save(); err == nil {
		t.Fatal("remove failure: want error")
	}
	// MkdirAll fails
	if err := (&totpState{dir: badDir(t), f: &totpFile{}}).save(); err == nil {
		t.Fatal("mkdir failure: want error")
	}
	// CreateTemp fails: read-only dir (root ignores permissions)
	if os.Geteuid() != 0 {
		ro := t.TempDir()
		_ = os.Chmod(ro, 0o500)
		t.Cleanup(func() { _ = os.Chmod(ro, 0o700) })
		if err := (&totpState{dir: ro, f: &totpFile{}}).save(); err == nil {
			t.Fatal("createtemp failure: want error")
		}
	}
}

func TestCheckEdgeCases(t *testing.T) {
	ts := &totpState{dir: t.TempDir()}
	if ts.check("123456", 0, true) {
		t.Fatal("not enrolled must fail")
	}
	ts.f = &totpFile{Secret: "!!not-base32!!"}
	if ts.check("123456", 0, true) {
		t.Fatal("corrupt secret must fail")
	}
}

func TestLoginSaveFailureRollsBack(t *testing.T) {
	e := totpEnv(t)
	secret, codes := enroll(t, e)
	good := e.a.totp.dir
	e.a.totp.dir = badDir(t)
	lastStep, nRec := e.a.totp.f.LastStep, len(e.a.totp.f.Recovery)
	*e.clk += 60
	if got := loginCode(e, totpAt(secret, *e.clk, 6)); got != 401 {
		t.Fatalf("totp with save failure: %d", got)
	}
	if e.a.totp.f.LastStep != lastStep {
		t.Fatal("LastStep not rolled back")
	}
	if got := loginCode(e, codes[0]); got != 401 {
		t.Fatalf("recovery with save failure: %d", got)
	}
	if len(e.a.totp.f.Recovery) != nRec {
		t.Fatal("recovery codes not rolled back")
	}
	e.a.totp.dir = good
	if got := loginCode(e, codes[0]); got != 200 {
		t.Fatalf("recovery after fix: %d", got)
	}
}

func TestEnrollAlreadyEnrolled(t *testing.T) {
	e := totpEnv(t)
	enroll(t, e)
	if w := do(e.h, "POST", "/api/totp/enroll", "localhost", nil, authed(e)); w.Code != 409 {
		t.Fatalf("re-enroll: %d", w.Code)
	}
}

func TestConfirmErrors(t *testing.T) {
	e := totpEnv(t)
	confirm := func(body any) int {
		return do(e.h, "POST", "/api/totp/confirm", "localhost", body, authed(e)).Code
	}
	if got := confirm(nil); got != 400 {
		t.Fatalf("bad body: %d", got)
	}
	if got := confirm(map[string]string{"code": "000000"}); got != 400 {
		t.Fatalf("no enrollment in progress: %d", got)
	}
	// save failure: enrollment stays pending, nothing is enabled
	w := do(e.h, "POST", "/api/totp/enroll", "localhost", nil, authed(e))
	var out struct{ Secret string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil {
		t.Fatalf("enroll: %d", w.Code)
	}
	secret, _ := b32.DecodeString(out.Secret)
	good := e.a.totp.dir
	e.a.totp.dir = badDir(t)
	if got := confirm(map[string]string{"code": totpAt(secret, *e.clk, 6)}); got != 500 {
		t.Fatalf("confirm save failure: %d", got)
	}
	if e.a.totp.enabled() {
		t.Fatal("must not be enabled after save failure")
	}
	e.a.totp.dir = good
	if got := confirm(map[string]string{"code": totpAt(secret, *e.clk, 6)}); got != 200 {
		t.Fatalf("confirm retry: %d", got)
	}
	if got := confirm(map[string]string{"code": "000000"}); got != 409 {
		t.Fatalf("confirm when enrolled: %d", got)
	}
}

func TestDisableErrors(t *testing.T) {
	e := totpEnv(t)
	secret, _ := enroll(t, e)
	dis := func(body any) int {
		return do(e.h, "POST", "/api/totp/disable", "localhost", body, authed(e)).Code
	}
	if got := dis(nil); got != 400 {
		t.Fatalf("bad body: %d", got)
	}
	// a failed attempt delays the next one
	if got := dis(map[string]string{"password": "wrong password", "code": "000000"}); got != 401 {
		t.Fatalf("bad creds: %d", got)
	}
	w := do(e.h, "POST", "/api/totp/disable", "localhost", map[string]string{"password": pw, "code": "000000"}, authed(e))
	if w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("throttled: %d retry-after=%q", w.Code, w.Header().Get("Retry-After"))
	}
	// save failure: stays enabled
	e.a.lim = newLimiter(time.Now)
	*e.clk += 60
	good := e.a.totp.dir
	e.a.totp.dir = badDir(t)
	if got := dis(map[string]string{"password": pw, "code": totpAt(secret, *e.clk, 6)}); got != 500 {
		t.Fatalf("disable save failure: %d", got)
	}
	e.a.totp.dir = good
	if !e.a.totp.enabled() {
		t.Fatal("must stay enabled after save failure")
	}
}
