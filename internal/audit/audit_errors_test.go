package audit

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLogDropsUnmarshalableEntry(t *testing.T) {
	p := filepath.Join(t.TempDir(), "audit.log")
	l := New(p)
	// Years outside [0,9999] make time.Time.MarshalJSON fail.
	l.Log(Entry{Event: "bad", Time: time.Date(10000, 1, 1, 0, 0, 0, 0, time.UTC)})
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatalf("log file should not exist, err = %v", err)
	}
}

func TestLogDropsWhenDirCannotBeCreated(t *testing.T) {
	blocker := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	// Parent "directory" is a regular file, so MkdirAll fails.
	l := New(filepath.Join(blocker, "sub", "audit.log"))
	l.Log(Entry{Event: "x"})
	if got := l.Recent(5); len(got) != 0 {
		t.Fatalf("recent = %+v", got)
	}
}

func TestLogDropsWhenFileCannotBeOpened(t *testing.T) {
	// Path is an existing directory, so OpenFile for writing fails.
	dir := t.TempDir()
	l := New(dir)
	l.Log(Entry{Event: "x"})
	if got := l.Recent(5); len(got) != 0 {
		t.Fatalf("recent = %+v", got)
	}
}

func TestHandlerEmptyLogReturnsEmptyArray(t *testing.T) {
	l := New(filepath.Join(t.TempDir(), "missing.log"))
	rec := httptest.NewRecorder()
	l.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/audit", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
	if body := strings.TrimSpace(rec.Body.String()); body != "[]" {
		t.Fatalf("body = %q", body)
	}
}
