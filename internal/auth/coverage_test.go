package auth

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNewErrors(t *testing.T) {
	bad := t.TempDir()
	_ = os.WriteFile(filepath.Join(bad, "auth.json"), []byte("{bad"), 0o600)
	if _, err := New(bad, func(string, ...any) {}); err == nil {
		t.Fatal("corrupt auth.json: want error")
	}
	unreadable := t.TempDir()
	_ = os.Mkdir(filepath.Join(unreadable, "auth.json"), 0o700) // a directory, not a file
	if _, err := New(unreadable, func(string, ...any) {}); err == nil {
		t.Fatal("unreadable auth.json: want error")
	}
}

func TestSetupBadBodyShortPasswordAndSaveFailure(t *testing.T) {
	a, h := newTest(t)
	if w := do(h, "POST", "/api/setup", "localhost", nil, nil); w.Code != 400 {
		t.Fatalf("empty body: %d", w.Code)
	}
	if w := do(h, "POST", "/api/setup", "localhost", map[string]string{"token": a.setupToken, "password": "short"}, nil); w.Code != 400 {
		t.Fatalf("short pw: %d", w.Code)
	}
	// dir whose parent is a regular file: MkdirAll fails -> 500
	f := filepath.Join(t.TempDir(), "file")
	_ = os.WriteFile(f, nil, 0o600)
	a.dir = filepath.Join(f, "sub")
	if w := do(h, "POST", "/api/setup", "localhost", map[string]string{"token": a.setupToken, "password": pw}, nil); w.Code != 500 {
		t.Fatalf("save failure: %d", w.Code)
	}
	if a.hash != "" {
		t.Fatal("hash must stay empty after failed save")
	}
}

func TestClientIPWithoutPort(t *testing.T) {
	r := httpReq("bogus")
	if got := clientIP(r); got != "bogus" {
		t.Fatalf("got %q", got)
	}
}

func TestLoginBadBodyAndBeforeSetupReleaseKey(t *testing.T) {
	a, h := newTest(t)
	if w := do(h, "POST", "/api/login", "localhost", nil, nil); w.Code != 400 {
		t.Fatalf("bad body: %d", w.Code)
	}
	// released, so the key is not throttled
	if w := do(h, "POST", "/api/login", "localhost", map[string]string{"password": pw}, nil); w.Code != 409 {
		t.Fatalf("before setup: %d", w.Code)
	}
	if _, ok := a.lim.begin("203.0.113.5"); !ok {
		t.Fatal("key still reserved after release")
	}
}

func TestPublicStateChangingOriginMismatch(t *testing.T) {
	_, h := newTest(t)
	w := do(h, "POST", "/api/login", "localhost", map[string]string{"password": pw}, func(r *http.Request) {
		r.Header.Set("Origin", "http://evil.example")
	})
	if w.Code != 403 {
		t.Fatalf("got %d", w.Code)
	}
}

func TestVerifyPasswordMalformed(t *testing.T) {
	for _, h := range []string{"", "x", "bcrypt$a$b", "argon2id$!!$AAAA", "argon2id$AAAA$!!"} {
		if verifyPassword(h, "pw") {
			t.Fatalf("%q must not verify", h)
		}
	}
	good, err := hashPassword("pw")
	if err != nil || !verifyPassword(good, "pw") || verifyPassword(good, "other") {
		t.Fatalf("roundtrip failed: %v", err)
	}
}

func TestLimiterUnknownKeys(t *testing.T) {
	l := newLimiter(time.Now)
	l.release("nobody") // no entry: no-op, no panic
	l.fail("fresh")     // fail without begin creates the entry
	if _, ok := l.begin("fresh"); ok {
		t.Fatal("failed key must be delayed")
	}
}

func TestSaveHashCreateTempFailure(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permissions")
	}
	dir := filepath.Join(t.TempDir(), "d")
	_ = os.Mkdir(dir, 0o500)
	if err := saveHash(dir, "h"); err == nil {
		t.Fatal("want error on read-only dir")
	}
}

func TestLoadSaveRoundtrip(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "new")
	if err := saveHash(dir, "abc"); err != nil {
		t.Fatal(err)
	}
	if h, err := loadHash(dir); err != nil || h != "abc" {
		t.Fatalf("h=%q err=%v", h, err)
	}
}

func httpReq(remote string) *http.Request {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = remote
	return r
}
