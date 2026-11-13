// Package auth implements standalone single-user password auth (ADR-0003).
package auth

import (
	"crypto/subtle"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
)

const (
	cookieName  = "tdog_session"
	minPassword = 8
)

// Auth holds the user, setup token and sessions.
type Auth struct {
	dir        string
	logf       func(string, ...any)
	mu         sync.Mutex // guards hash and setupToken
	hash       string
	setupToken string
	sessions   *sessions
	lim        *limiter
	totp       *totpState
	now        func() time.Time
	audit      *audit.Logger
	verify     func(hash, pw string) bool
}

// New loads auth state from dir/auth.json. With no user it creates a
// one-time setup token and logs it via logf.
func New(dir string, logf func(string, ...any)) (*Auth, error) {
	h, err := loadHash(dir)
	if err != nil {
		return nil, err
	}
	t, err := loadTOTP(dir)
	if err != nil {
		return nil, err
	}
	a := &Auth{dir: dir, logf: logf, hash: h, sessions: newSessions(), lim: newLimiter(time.Now), verify: verifyPassword, totp: t, now: time.Now,
		audit: audit.New(filepath.Join(dir, "audit.log"))}
	if h == "" {
		a.setupToken = randToken(16)
		logf("tdog first run: POST /api/setup with setup token %s", a.setupToken)
	}
	return a, nil
}

// Register adds the login, logout and setup routes to mux.
func (a *Auth) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/setup", a.handleSetup)
	mux.HandleFunc("POST /api/login", a.handleLogin)
	mux.HandleFunc("POST /api/logout", a.handleLogout)
	mux.HandleFunc("GET /api/session", a.handleSession)
	mux.HandleFunc("POST /api/totp/enroll", a.handleTOTPEnroll)
	mux.HandleFunc("POST /api/totp/confirm", a.handleTOTPConfirm)
	mux.HandleFunc("POST /api/totp/disable", a.handleTOTPDisable)
	mux.HandleFunc("GET /api/status", a.handleStatus)
	mux.HandleFunc("POST /api/sessions/revoke-all", a.handleRevokeAll)
	mux.Handle("GET /api/audit", a.audit.Handler())
}

// Audit returns the audit logger (never nil).
func (a *Auth) Audit() *audit.Logger { return a.audit }

func (a *Auth) log(r *http.Request, event string) {
	a.audit.Log(audit.Entry{Event: event, IP: clientIP(r)})
}

// handleRevokeAll invalidates every session, including the caller's.
func (a *Auth) handleRevokeAll(w http.ResponseWriter, r *http.Request) {
	a.sessions.clear()
	a.log(r, "sessions_revoke_all")
	clearSessionCookie(w, r)
	w.WriteHeader(http.StatusOK)
}

// handleStatus tells the UI whether first-run setup is pending and whether
// the caller already holds a valid session. It exposes no secrets.
func (a *Auth) handleStatus(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	setup := a.hash == ""
	a.mu.Unlock()
	authed := false
	if c, err := r.Cookie(cookieName); err == nil {
		authed = a.sessions.touch(c.Value) != nil
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]bool{"setup": setup, "authenticated": authed})
}

func msg(w http.ResponseWriter, code int, m string) { http.Error(w, m, code) }

func (a *Auth) handleSetup(w http.ResponseWriter, r *http.Request) {
	var in struct{ Token, Password string }
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in) != nil {
		msg(w, 400, "bad request")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.hash != "" {
		msg(w, http.StatusConflict, "already set up")
		return
	}
	if subtle.ConstantTimeCompare([]byte(in.Token), []byte(a.setupToken)) != 1 {
		msg(w, http.StatusForbidden, "invalid setup token")
		return
	}
	if len(in.Password) < minPassword {
		msg(w, 400, "password too short")
		return
	}
	h, err := hashPassword(in.Password)
	if err == nil {
		err = saveHash(a.dir, h)
	}
	if err != nil {
		msg(w, 500, "setup failed")
		return
	}
	a.hash, a.setupToken = h, ""
	a.log(r, "setup")
	w.WriteHeader(http.StatusOK)
}

func clientIP(r *http.Request) string {
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

func isLocalhost(host string) bool {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func (a *Auth) handleLogin(w http.ResponseWriter, r *http.Request) {
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
	if hash == "" {
		a.lim.release(ip)
		msg(w, http.StatusConflict, "setup required")
		return
	}
	if !a.verify(hash, in.Password) {
		a.lim.fail(ip)
		a.log(r, "login_fail")
		msg(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if a.totp.enabled() {
		if in.Code == "" {
			a.lim.release(ip)
			w.Header().Set("X-TOTP-Required", "1")
			msg(w, http.StatusUnauthorized, "totp required")
			return
		}
		if !a.totp.check(in.Code, a.now().Unix(), true) {
			a.lim.fail(ip)
			a.log(r, "login_fail")
			msg(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
	}
	a.lim.ok(ip)
	a.log(r, "login_ok")
	id, csrf := a.sessions.create()
	setSessionCookie(w, r, id)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"csrf": csrf})
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, id string) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: id, Path: "/", MaxAge: int(idleTimeout.Seconds()),
		HttpOnly: true, Secure: !isLocalhost(r.Host), SameSite: http.SameSiteStrictMode,
	})
}

func (a *Auth) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		a.sessions.delete(c.Value)
	}
	a.log(r, "logout")
	clearSessionCookie(w, r)
	w.WriteHeader(http.StatusOK)
}

func clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: !isLocalhost(r.Host), SameSite: http.SameSiteStrictMode})
}

func isWS(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

// sameOrigin reports whether the Origin header matches the request host.
// A missing Origin passes unless required.
func sameOrigin(r *http.Request, required bool) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return !required
	}
	u, err := url.Parse(o)
	return err == nil && strings.EqualFold(u.Host, r.Host)
}

func stateChanging(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	}
	return true
}

func isPublic(r *http.Request) bool {
	p := r.URL.Path
	switch p {
	case "/healthz", "/api/login", "/api/setup", "/api/status":
		return true
	}
	api := p == "/api" || strings.HasPrefix(p, "/api/")
	ws := p == "/ws" || strings.HasPrefix(p, "/ws/")
	// static UI assets (incl. the login page) carry no secrets
	return !api && !ws && !isWS(r) && (r.Method == http.MethodGet || r.Method == http.MethodHead)
}

// Middleware authenticates every request except the public ones.
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublic(r) {
			if stateChanging(r) && !sameOrigin(r, false) {
				msg(w, http.StatusForbidden, "origin mismatch")
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		var s *session
		if c, err := r.Cookie(cookieName); err == nil {
			if s = a.sessions.touch(c.Value); s != nil {
				setSessionCookie(w, r, c.Value) // slide the browser expiry with the idle timer
			}
		}
		if s == nil {
			msg(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		if !sameOrigin(r, isWS(r)) {
			msg(w, http.StatusForbidden, "origin mismatch")
			return
		}
		if stateChanging(r) && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(s.csrf)) != 1 {
			msg(w, http.StatusForbidden, "csrf token invalid")
			return
		}
		next.ServeHTTP(w, r)
	})
}
