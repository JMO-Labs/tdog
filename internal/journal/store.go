package journal

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var paneRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// ValidPane reports whether id is safe to use as a file name.
func ValidPane(id string) bool { return paneRe.MatchString(id) }

// Store keeps acked journal events in per-pane files for cross-device search.
// Layout under dir/journal (0700): <pane>.jsonl (0600; one {"sid","ev"} per
// line), <pane>.exp (unix expiry; a separate file so an append never rewrites
// the log), and settings.json ({"retentionHours":N}; 0 = off, the default).
type Store struct {
	dir string
	mu  sync.Mutex
	ret time.Duration
}

// NewStore opens (lazily creating) the store under dir/journal and loads the
// persisted retention; any read problem leaves sync off.
func NewStore(dir string) *Store {
	s := &Store{dir: dir}
	if b, err := os.ReadFile(filepath.Join(s.path(), "settings.json")); err == nil {
		var v struct {
			H int `json:"retentionHours"`
		}
		if json.Unmarshal(b, &v) == nil && validHours(v.H) {
			s.ret = time.Duration(v.H) * time.Hour
		}
	}
	return s
}

func (s *Store) path() string { return filepath.Join(s.dir, "journal") }

func validHours(h int) bool { return h == 0 || h == 12 || h == 24 || h == 36 }

// Enabled reports whether server sync is on.
func (s *Store) Enabled() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.ret > 0
}

// SetRetention sets retention to 0 (off, deletes all files), 12, 24 or 36 hours.
func (s *Store) SetRetention(h int) error {
	if !validHours(h) {
		return fmt.Errorf("journal: bad retention %d", h)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(s.path(), 0o700); err != nil {
		return err
	}
	if h == 0 {
		s.removeAll()
	}
	b, _ := json.Marshal(map[string]int{"retentionHours": h})
	if err := os.WriteFile(filepath.Join(s.path(), "settings.json"), b, 0o600); err != nil {
		return err
	}
	s.ret = time.Duration(h) * time.Hour
	return nil
}

// removeAll deletes every pane file (not settings); callers hold s.mu.
func (s *Store) removeAll() {
	es, _ := os.ReadDir(s.path())
	for _, e := range es {
		if n := e.Name(); strings.HasSuffix(n, ".jsonl") || strings.HasSuffix(n, ".exp") {
			_ = os.Remove(filepath.Join(s.path(), n))
		}
	}
}

// Append adds evs for session sid to pane's file and pushes its expiry to now
// plus retention. It is a no-op while sync is off.
func (s *Store) Append(pane, sid string, evs []Event) error {
	if !ValidPane(pane) {
		return errors.New("journal: invalid pane id")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ret == 0 || len(evs) == 0 {
		return nil
	}
	if err := os.MkdirAll(s.path(), 0o700); err != nil {
		return err
	}
	var buf []byte
	for _, e := range evs {
		b, err := json.Marshal(struct {
			Sid string `json:"sid"`
			Ev  Event  `json:"ev"`
		}{sid, e})
		if err != nil {
			return err
		}
		buf = append(append(buf, b...), '\n')
	}
	f, err := os.OpenFile(filepath.Join(s.path(), pane+".jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, werr := f.Write(buf)
	if cerr := f.Close(); werr == nil {
		werr = cerr
	}
	if werr != nil {
		return werr
	}
	exp := strconv.FormatInt(time.Now().Add(s.ret).Unix(), 10)
	return os.WriteFile(filepath.Join(s.path(), pane+".exp"), []byte(exp), 0o600)
}

// DeletePane removes pane's files at once.
func (s *Store) DeletePane(pane string) error {
	if !ValidPane(pane) {
		return errors.New("journal: invalid pane id")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, ext := range []string{".jsonl", ".exp"} {
		if err := os.Remove(filepath.Join(s.path(), pane+ext)); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

// expired reports whether pane's expiry is at or before now; a missing or
// unreadable expiry counts as expired. Callers hold s.mu.
func (s *Store) expired(pane string, now time.Time) bool {
	b, err := os.ReadFile(filepath.Join(s.path(), pane+".exp"))
	if err != nil {
		return true
	}
	n, err := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	return err != nil || n <= now.Unix()
}

// panes lists pane ids that have a log file; callers hold s.mu.
func (s *Store) panes() []string {
	es, _ := os.ReadDir(s.path())
	var out []string
	for _, e := range es {
		if p, ok := strings.CutSuffix(e.Name(), ".jsonl"); ok && ValidPane(p) {
			out = append(out, p)
		}
	}
	return out
}

// Sweep deletes the files of every pane whose expiry has passed.
func (s *Store) Sweep(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.panes() {
		if s.expired(p, now) {
			for _, ext := range []string{".jsonl", ".exp"} {
				_ = os.Remove(filepath.Join(s.path(), p+ext))
			}
		}
	}
}

// Run sweeps every interval until stop closes; start it from server wiring only.
func (s *Store) Run(interval time.Duration, stop <-chan struct{}) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case now := <-t.C:
			s.Sweep(now)
		}
	}
}

// Line is one served history row.
type Line struct {
	Pane string `json:"pane"`
	Sid  string `json:"sid"`
	Ev   Event  `json:"ev"`
}

// Read returns every non-expired row with ev.at >= since, panes in name order.
func (s *Store) Read(since time.Time) []Line {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Line
	now := time.Now()
	for _, p := range s.panes() {
		if s.expired(p, now) {
			continue
		}
		b, err := os.ReadFile(filepath.Join(s.path(), p+".jsonl"))
		if err != nil {
			continue
		}
		for _, ln := range strings.Split(string(b), "\n") {
			var r struct {
				Sid string `json:"sid"`
				Ev  Event  `json:"ev"`
			}
			if ln == "" || json.Unmarshal([]byte(ln), &r) != nil || r.Ev.At.Before(since) {
				continue
			}
			out = append(out, Line{p, r.Sid, r.Ev})
		}
	}
	return out
}
