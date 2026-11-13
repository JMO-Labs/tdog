package auth

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
)

// Seams for fault injection in tests.
var (
	removeFile = os.Remove
	tmpWrite   = func(f *os.File, b []byte) (int, error) { return f.Write(b) }
	tmpClose   = func(f *os.File) error { return f.Close() }
)

type totpFile struct {
	Secret   string   `json:"secret"`
	Recovery []string `json:"recovery"` // sha256 hex of unused codes
	LastStep int64    `json:"last_step"`
}

// totpState holds the enrolled TOTP config and a pending enrollment.
type totpState struct {
	mu      sync.Mutex
	dir     string
	f       *totpFile // nil when not enrolled
	pending []byte
}

func loadTOTP(dir string) (*totpState, error) {
	t := &totpState{dir: dir}
	b, err := os.ReadFile(filepath.Join(dir, "totp.json"))
	if errors.Is(err, os.ErrNotExist) {
		return t, nil
	}
	if err != nil {
		return nil, err
	}
	t.f = &totpFile{}
	return t, json.Unmarshal(b, t.f)
}

// save persists state (caller holds mu); nil f removes the file.
func (t *totpState) save() error {
	p := filepath.Join(t.dir, "totp.json")
	if t.f == nil {
		if err := removeFile(p); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return nil
	}
	if err := os.MkdirAll(t.dir, 0o700); err != nil {
		return err
	}
	b, _ := json.Marshal(t.f)
	tmp, err := os.CreateTemp(t.dir, "totp-*.tmp")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if _, err := tmpWrite(tmp, b); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmpClose(tmp); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), p)
}

func (t *totpState) enabled() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.f != nil
}

// check validates a TOTP code or recovery code. Used codes are consumed.
func (t *totpState) check(code string, now int64, allowRecovery bool) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.f == nil {
		return false
	}
	secret, err := b32.DecodeString(t.f.Secret)
	if err != nil {
		return false
	}
	if step, ok := matchTOTP(secret, code, now, t.f.LastStep); ok {
		old := t.f.LastStep
		t.f.LastStep = step
		if t.save() != nil {
			t.f.LastStep = old
			return false
		}
		return true
	}
	if !allowRecovery {
		return false
	}
	h := hashRecovery(code)
	for i, r := range t.f.Recovery {
		if subtle.ConstantTimeCompare([]byte(h), []byte(r)) == 1 {
			old := t.f.Recovery
			t.f.Recovery = append(append([]string{}, old[:i]...), old[i+1:]...)
			if t.save() != nil {
				t.f.Recovery = old
				return false
			}
			return true
		}
	}
	return false
}

func (a *Auth) handleSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{
		"totp_enabled": a.totp.enabled(),
		"remote":       !isLocalhost(r.Host),
	})
}

func (a *Auth) handleTOTPEnroll(w http.ResponseWriter, _ *http.Request) {
	t := a.totp
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.f != nil {
		msg(w, http.StatusConflict, "already enrolled")
		return
	}
	s, err := newSecret()
	if err != nil {
		msg(w, 500, "enroll failed")
		return
	}
	t.pending = s
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"secret": b32.EncodeToString(s), "uri": otpauthURI(s, "admin")})
}

func (a *Auth) handleTOTPConfirm(w http.ResponseWriter, r *http.Request) {
	var in struct{ Code string }
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in) != nil {
		msg(w, 400, "bad request")
		return
	}
	t := a.totp
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.f != nil {
		msg(w, http.StatusConflict, "already enrolled")
		return
	}
	if t.pending == nil {
		msg(w, 400, "no enrollment in progress")
		return
	}
	step, ok := matchTOTP(t.pending, in.Code, a.now().Unix(), -1)
	if !ok {
		msg(w, http.StatusUnauthorized, "invalid code")
		return
	}
	plain, hashed, err := newRecoveryCodes()
	if err != nil {
		msg(w, 500, "enroll failed")
		return
	}
	t.f = &totpFile{Secret: b32.EncodeToString(t.pending), Recovery: hashed, LastStep: step}
	if err := t.save(); err != nil {
		t.f = nil
		msg(w, 500, "enroll failed")
		return
	}
	t.pending = nil
	a.log(r, "totp_enroll")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string][]string{"recovery_codes": plain})
}

func (a *Auth) handleTOTPDisable(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	d, ok := a.lim.begin(ip)
	if !ok {
		w.Header().Set("Retry-After", strconv.Itoa(int(d.Seconds())+1))
		msg(w, http.StatusTooManyRequests, "too many attempts")
		return
	}
	var in struct{ Password, Code string }
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in) != nil {
		a.lim.release(ip)
		msg(w, 400, "bad request")
		return
	}
	a.mu.Lock()
	hash := a.hash
	a.mu.Unlock()
	if !a.verify(hash, in.Password) || !a.totp.check(in.Code, a.now().Unix(), false) {
		a.lim.fail(ip)
		msg(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	a.lim.ok(ip)
	a.totp.mu.Lock()
	defer a.totp.mu.Unlock()
	old := a.totp.f
	a.totp.f = nil
	if err := a.totp.save(); err != nil {
		a.totp.f = old
		msg(w, 500, "disable failed")
		return
	}
	a.log(r, "totp_disable")
	w.WriteHeader(http.StatusOK)
}
