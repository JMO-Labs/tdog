package journal

import (
	"context"
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
	now func() time.Time // test seam

	trimmed map[string]time.Time // last per-pane trim; guarded by mu

	// Append guards, so a delete can never be undone by a late ack. closed is a
	// pane between a forget's delete and its Reopen; killed holds sessions that
	// were killed (keyed by sid so a later session on the same pane still syncs)
	// and is never reopened.
	closed, killed map[string]bool
	gen            map[string]uint64 // bumped by every delete: refuses appends of events read before it
}

// trimEvery bounds how often an append rewrites a pane's file to drop rows
// older than the retention window (Read filters them regardless).
const trimEvery = time.Hour

// NewStore opens (lazily creating) the store under dir/journal and loads the
// persisted retention; any read problem leaves sync off.
func NewStore(dir string) *Store {
	s := &Store{dir: dir, now: time.Now, trimmed: map[string]time.Time{}, closed: map[string]bool{}, killed: map[string]bool{}, gen: map[string]uint64{}}
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
	if h > 0 { // lowering must shorten what is already on disk; raising never extends
		limit := s.now().Add(s.ret).Unix()
		for _, p := range s.panes() {
			if n, ok := s.expiry(p); ok && n > limit {
				s.setExp(p, limit)
			}
		}
	}
	return nil
}

func (s *Store) setExp(pane string, unix int64) {
	_ = os.WriteFile(filepath.Join(s.path(), pane+".exp"), []byte(strconv.FormatInt(unix, 10)), 0o600)
}

// expiry reads pane's expiry (unix); ok is false when missing or unreadable.
func (s *Store) expiry(pane string) (int64, bool) {
	b, err := os.ReadFile(filepath.Join(s.path(), pane+".exp"))
	if err != nil {
		return 0, false
	}
	n, err := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	return n, err == nil
}

// trim rewrites pane's file keeping rows inside the retention window; callers
// hold s.mu. Failures leave the file as is (Read still filters).
func (s *Store) trim(pane string) {
	f := filepath.Join(s.path(), pane+".jsonl")
	b, err := os.ReadFile(f)
	if err != nil {
		return
	}
	cut := s.now().Add(-s.ret)
	var keep []byte
	for _, ln := range strings.SplitAfter(string(b), "\n") {
		var r struct {
			Ev Event `json:"ev"`
		}
		if ln != "" && json.Unmarshal([]byte(ln), &r) == nil && !r.Ev.At.Before(cut) {
			keep = append(keep, ln...)
		}
	}
	if len(keep) == len(b) {
		return
	}
	tmp := f + ".tmp"
	if os.WriteFile(tmp, keep, 0o600) == nil {
		_ = os.Rename(tmp, f)
	}
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
	return s.AppendAt(pane, sid, evs, s.Gen(pane))
}

// Gen is pane's delete generation. Read it before taking events, then pass it
// to AppendAt: a delete in between makes the append a no-op.
func (s *Store) Gen(pane string) uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.gen[pane]
}

// AppendAt is Append that is dropped if pane was deleted since gen was read.
func (s *Store) AppendAt(pane, sid string, evs []Event, gen uint64) error {
	if !ValidPane(pane) {
		return errors.New("journal: invalid pane id")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.gen[pane] != gen {
		return nil
	}
	if s.ret == 0 || len(evs) == 0 || s.closed[pane] || s.killed[sid] {
		return nil
	}
	if err := os.MkdirAll(s.path(), 0o700); err != nil {
		return err
	}
	if last, ok := s.trimmed[pane]; !ok || s.now().Sub(last) >= trimEvery {
		s.trim(pane)
		s.trimmed[pane] = s.now()
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
	s.setExp(pane, s.now().Add(s.ret).Unix())
	return nil
}

// DeletePane removes pane's files at once and refuses appends to it until
// Reopen (a forget: recording continues afterwards).
func (s *Store) DeletePane(pane string) error {
	return s.drop(pane, "")
}

// KillPane is DeletePane for a killed session sid: appends from that session
// are refused for good, whatever a concurrent Reopen does.
func (s *Store) KillPane(pane, sid string) error {
	return s.drop(pane, sid)
}

// KillSid refuses session sid's appends for good, on any pane (a kill before
// the session had a pane).
func (s *Store) KillSid(sid string) {
	s.mu.Lock()
	s.killed[sid] = true
	s.mu.Unlock()
}

// Reopen lets appends to pane resume after a forget; killed sessions stay out.
func (s *Store) Reopen(pane string) {
	s.mu.Lock()
	delete(s.closed, pane)
	s.mu.Unlock()
}

func (s *Store) drop(pane, killSid string) error {
	if !ValidPane(pane) {
		return errors.New("journal: invalid pane id")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if killSid != "" {
		s.killed[killSid] = true
	} else {
		s.closed[pane] = true
	}
	s.gen[pane]++
	delete(s.trimmed, pane)
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
	n, ok := s.expiry(pane)
	return !ok || n <= now.Unix()
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
			delete(s.trimmed, p)
		}
	}
	es, _ := os.ReadDir(s.path()) // .exp files whose log is gone
	for _, e := range es {
		if p, ok := strings.CutSuffix(e.Name(), ".exp"); ok {
			if _, err := os.Stat(filepath.Join(s.path(), p+".jsonl")); os.IsNotExist(err) {
				_ = os.Remove(filepath.Join(s.path(), e.Name()))
			}
		}
	}
}

// Run sweeps every interval until ctx ends; start it from server wiring only.
func (s *Store) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
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
	now := s.now()
	since = laterOf(since, now.Add(-s.ret)) // the file may hold rows older than the window
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

func laterOf(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
