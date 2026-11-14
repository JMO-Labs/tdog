// Package audit keeps an append-only JSON-lines audit log (spec §10).
package audit

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"
)

const (
	defaultLimit = 100
	maxLimit     = 1000
)

// Entry is one audit record.
type Entry struct {
	Time    time.Time `json:"time"`
	Event   string    `json:"event"`
	IP      string    `json:"ip,omitempty"`
	Target  string    `json:"target,omitempty"`
	PID     int       `json:"pid,omitempty"`
	Session string    `json:"session,omitempty"`
	Scene   string    `json:"scene,omitempty"`
	Count   *int      `json:"count,omitempty"` // shells affected (kill events)
}

// Logger appends entries to a file. A nil *Logger is a no-op.
type Logger struct {
	mu   sync.Mutex
	path string
}

// New returns a logger writing to path (created on first write).
func New(path string) *Logger { return &Logger{path: path} }

// Log appends e, stamping the time when unset. Errors are dropped: auditing
// must never break the request path.
func (l *Logger) Log(e Entry) {
	if l == nil {
		return
	}
	if e.Time.IsZero() {
		e.Time = time.Now().UTC()
	}
	b, err := json.Marshal(e)
	if err != nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if os.MkdirAll(filepath.Dir(l.path), 0o700) != nil {
		return
	}
	f, err := os.OpenFile(l.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer func() { _ = f.Close() }()
	_, _ = f.Write(append(b, '\n'))
}

// Recent returns up to limit entries, newest first.
func (l *Logger) Recent(limit int) []Entry {
	if l == nil || limit <= 0 {
		return nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	f, err := os.Open(l.path)
	if err != nil {
		return nil
	}
	defer func() { _ = f.Close() }()
	var all []Entry
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		var e Entry
		if json.Unmarshal(sc.Bytes(), &e) == nil {
			all = append(all, e)
		}
	}
	var out []Entry
	for i := len(all) - 1; i >= 0 && len(out) < limit; i-- {
		out = append(out, all[i])
	}
	return out
}

// Handler serves GET /api/audit?limit=N (default 100, max 1000).
// Callers must wrap it with authentication.
func (l *Logger) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n, err := strconv.Atoi(r.URL.Query().Get("limit"))
		if err != nil || n <= 0 {
			n = defaultLimit
		}
		n = min(n, maxLimit)
		out := l.Recent(n)
		if out == nil {
			out = []Entry{}
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(out)
	})
}
