package journal

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// base is when event seq 0 happened: recent enough to be inside any retention.
var base = time.Now().Add(-time.Hour).Truncate(time.Second)

func evs(seqs ...uint64) []Event {
	var out []Event
	for _, s := range seqs {
		out = append(out, Event{Seq: s, Kind: "out", Rec: 1, Text: "x", At: base.Add(time.Duration(s) * time.Second).UTC()})
	}
	return out
}

func newOn(t *testing.T) (*Store, string) {
	t.Helper()
	d := t.TempDir()
	s := NewStore(d)
	if err := s.SetRetention(12); err != nil {
		t.Fatal(err)
	}
	return s, d
}

func TestAppendRejectsBadPane(t *testing.T) {
	s, d := newOn(t)
	for _, p := range []string{"../x", "a/b", "", strings.Repeat("a", 65), "a.b"} {
		if s.Append(p, "s", evs(1)) == nil {
			t.Errorf("Append(%q) accepted", p)
		}
		if s.DeletePane(p) == nil {
			t.Errorf("DeletePane(%q) accepted", p)
		}
	}
	if _, err := os.Stat(filepath.Join(d, "x.jsonl")); err == nil {
		t.Fatal("escaped journal dir")
	}
}

func TestAppendDisabledNoop(t *testing.T) {
	s := NewStore(t.TempDir())
	if err := s.Append("p", "s", evs(1)); err != nil {
		t.Fatal(err)
	}
	if s.Enabled() {
		t.Fatal("enabled by default")
	}
	if es, _ := os.ReadDir(filepath.Join(s.dir, "journal")); len(es) != 0 {
		t.Fatalf("files written while off: %v", es)
	}
}

func TestSetRetentionValidAndPersisted(t *testing.T) {
	d := t.TempDir()
	s := NewStore(d)
	for _, h := range []int{-1, 1, 13, 48} {
		if s.SetRetention(h) == nil {
			t.Errorf("accepted %d", h)
		}
	}
	if err := s.SetRetention(24); err != nil || !s.Enabled() {
		t.Fatal(err)
	}
	if !NewStore(d).Enabled() {
		t.Fatal("retention not persisted")
	}
	fi, err := os.Stat(filepath.Join(d, "journal"))
	if err != nil || fi.Mode().Perm() != 0o700 {
		t.Fatalf("dir mode: %v %v", fi, err)
	}
}

func TestSetZeroDeletesAll(t *testing.T) {
	s, d := newOn(t)
	_ = s.Append("a", "s", evs(1))
	_ = s.Append("b", "s", evs(1))
	if err := s.SetRetention(0); err != nil {
		t.Fatal(err)
	}
	es, _ := os.ReadDir(filepath.Join(d, "journal"))
	for _, e := range es {
		if e.Name() != "settings.json" {
			t.Errorf("left %s", e.Name())
		}
	}
}

func TestDeletePaneImmediate(t *testing.T) {
	s, d := newOn(t)
	_ = s.Append("a", "s", evs(1))
	_ = s.Append("b", "s", evs(1))
	if err := s.DeletePane("a"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(d, "journal", "a.jsonl")); err == nil {
		t.Fatal("a still there")
	}
	if _, err := os.Stat(filepath.Join(d, "journal", "b.jsonl")); err != nil {
		t.Fatal("b removed")
	}
	rec := httptest.NewRecorder()
	NewHandler(s).ServeHTTP(rec, httptest.NewRequest("GET", "/api/journal", nil))
	if strings.Contains(rec.Body.String(), `"pane":"a"`) {
		t.Fatal("GET still serves a")
	}
}

func TestSweepExpiredOnly(t *testing.T) {
	s, d := newOn(t)
	_ = s.Append("old", "s", evs(1))
	_ = s.Append("new", "s", evs(1))
	// Age "old": expiry in the past.
	if err := os.WriteFile(filepath.Join(d, "journal", "old.exp"), []byte("1"), 0o600); err != nil {
		t.Fatal(err)
	}
	s.Sweep(time.Now())
	if _, err := os.Stat(filepath.Join(d, "journal", "old.jsonl")); err == nil {
		t.Fatal("old survived")
	}
	if _, err := os.Stat(filepath.Join(d, "journal", "old.exp")); err == nil {
		t.Fatal("old.exp survived")
	}
	if _, err := os.Stat(filepath.Join(d, "journal", "new.jsonl")); err != nil {
		t.Fatal("new swept")
	}
}

func TestAppendFileModeAndLines(t *testing.T) {
	s, d := newOn(t)
	_ = s.Append("p", "sid1", evs(1, 2))
	b, _ := os.ReadFile(filepath.Join(d, "journal", "p.jsonl"))
	if n := strings.Count(string(b), "\n"); n != 2 {
		t.Fatalf("lines %d: %s", n, b)
	}
	fi, _ := os.Stat(filepath.Join(d, "journal", "p.jsonl"))
	if fi.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v", fi.Mode())
	}
}

func exp(t *testing.T, d, pane string) int64 {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(d, "journal", pane+".exp"))
	if err != nil {
		t.Fatal(err)
	}
	n, _ := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	return n
}

func TestReadDropsRowsOlderThanRetention(t *testing.T) {
	s, _ := newOn(t)
	old := []Event{{Seq: 1, Kind: "out", At: time.Now().Add(-13 * time.Hour)}}
	_ = s.Append("p", "s", old)
	_ = s.Append("p", "s", evs(2))
	rows := s.Read(time.Unix(0, 0))
	if len(rows) != 1 || rows[0].Ev.Seq != 2 {
		t.Fatalf("rows %+v", rows)
	}
}

func TestAppendTrimsOldRowsAtMostHourly(t *testing.T) {
	s, d := newOn(t)
	t0 := time.Now()
	s.now = func() time.Time { return t0 }
	_ = s.Append("p", "s", []Event{{Seq: 1, Kind: "out", At: t0.Add(-time.Hour)}})
	s.now = func() time.Time { return t0.Add(30 * time.Minute) } // < 1h: no trim
	_ = s.Append("p", "s", []Event{{Seq: 2, Kind: "out", At: t0.Add(30 * time.Minute)}})
	b, _ := os.ReadFile(filepath.Join(d, "journal", "p.jsonl"))
	if n := strings.Count(string(b), "\n"); n != 2 {
		t.Fatalf("early trim: %d lines", n)
	}
	s.now = func() time.Time { return t0.Add(14 * time.Hour) }
	_ = s.Append("p", "s", []Event{{Seq: 3, Kind: "out", At: t0.Add(14 * time.Hour)}})
	b, _ = os.ReadFile(filepath.Join(d, "journal", "p.jsonl"))
	if n := strings.Count(string(b), "\n"); n != 1 || !strings.Contains(string(b), `"seq":3`) {
		t.Fatalf("not trimmed: %s", b)
	}
}

func TestLoweringRetentionShortensExpiry(t *testing.T) {
	s, d := newOn(t)
	_ = s.SetRetention(36)
	_ = s.Append("p", "s", evs(1))
	long := exp(t, d, "p")
	if err := s.SetRetention(12); err != nil {
		t.Fatal(err)
	}
	got := exp(t, d, "p")
	if got >= long || got > time.Now().Add(12*time.Hour).Unix()+2 {
		t.Fatalf("exp %d (was %d)", got, long)
	}
	_ = s.SetRetention(36) // raising never extends existing files
	if exp(t, d, "p") != got {
		t.Fatal("raise extended expiry")
	}
}

func TestSweepRemovesOrphanExp(t *testing.T) {
	s, d := newOn(t)
	orphan := filepath.Join(d, "journal", "gone.exp")
	if err := os.WriteFile(orphan, []byte("99999999999"), 0o600); err != nil {
		t.Fatal(err)
	}
	s.Sweep(time.Now())
	if _, err := os.Stat(orphan); err == nil {
		t.Fatal("orphan .exp left")
	}
}
