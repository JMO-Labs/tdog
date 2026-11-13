package audit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLogAppendsJSONLines(t *testing.T) {
	p := filepath.Join(t.TempDir(), "sub", "audit.log")
	l := New(p)
	l.Log(Entry{Event: "login_ok", IP: "1.2.3.4"})
	l.Log(Entry{Event: "term_start", Target: "container", PID: 42})
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if n := strings.Count(string(b), "\n"); n != 2 {
		t.Fatalf("lines = %d: %q", n, b)
	}
	got := l.Recent(10)
	if len(got) != 2 || got[0].Event != "term_start" || got[0].PID != 42 || got[0].Target != "container" || got[0].Time.IsZero() {
		t.Fatalf("recent = %+v", got)
	}
	if got[1].Event != "login_ok" || got[1].IP != "1.2.3.4" {
		t.Fatalf("recent = %+v", got)
	}
}

func TestRecentLimitAndMissingFile(t *testing.T) {
	l := New(filepath.Join(t.TempDir(), "audit.log"))
	if got := l.Recent(5); len(got) != 0 {
		t.Fatalf("empty = %+v", got)
	}
	for _, e := range []string{"a", "b", "c"} {
		l.Log(Entry{Event: e})
	}
	got := l.Recent(2)
	if len(got) != 2 || got[0].Event != "c" || got[1].Event != "b" {
		t.Fatalf("recent = %+v", got)
	}
}

func TestNilLoggerSafe(t *testing.T) {
	var l *Logger
	l.Log(Entry{Event: "x"})
	if l.Recent(3) != nil {
		t.Fatal("nil logger returned entries")
	}
}

func TestHandler(t *testing.T) {
	l := New(filepath.Join(t.TempDir(), "audit.log"))
	for _, e := range []string{"a", "b", "c"} {
		l.Log(Entry{Event: e})
	}
	for q, want := range map[string]int{"": 3, "?limit=2": 2, "?limit=0": 3, "?limit=x": 3, "?limit=-1": 3} {
		w := httptest.NewRecorder()
		l.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/audit"+q, nil))
		var out []Entry
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || len(out) != want {
			t.Fatalf("%q: %v len=%d want %d", q, err, len(out), want)
		}
	}
}
