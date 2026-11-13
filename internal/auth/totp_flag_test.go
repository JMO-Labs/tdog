package auth

import (
	"testing"
	"time"
)

func TestLoginTOTPRequiredHeader(t *testing.T) {
	e := totpEnv(t)
	enroll(t, e)
	e.a.lim = newLimiter(time.Now)
	w := do(e.h, "POST", "/api/login", "localhost", map[string]string{"password": pw}, nil)
	if w.Code != 401 || w.Header().Get("X-TOTP-Required") != "1" {
		t.Fatalf("missing code: %d hdr=%q", w.Code, w.Header().Get("X-TOTP-Required"))
	}
	e.a.lim = newLimiter(time.Now)
	w = do(e.h, "POST", "/api/login", "localhost", map[string]string{"password": pw, "code": "000000"}, nil)
	if w.Code != 401 || w.Header().Get("X-TOTP-Required") != "" {
		t.Fatalf("bad code: %d hdr=%q", w.Code, w.Header().Get("X-TOTP-Required"))
	}
}
