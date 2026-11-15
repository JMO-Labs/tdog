package journal

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func put(h http.Handler, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("PUT", "/api/journal/settings", strings.NewReader(body)))
	return rec
}

func TestSettingsValidation(t *testing.T) {
	s := NewStore(t.TempDir())
	h := NewHandler(s)
	for _, b := range []string{`{"retentionHours":5}`, `{"retentionHours":-1}`, `nope`, `{"retentionHours":"12"}`, strings.Repeat(" ", 2000) + `{"retentionHours":12}`} {
		if c := put(h, b).Code; c != http.StatusBadRequest {
			t.Errorf("%.30q: %d", b, c)
		}
	}
	if s.Enabled() {
		t.Fatal("enabled by bad input")
	}
	if c := put(h, `{"retentionHours":24}`).Code; c != http.StatusNoContent || !s.Enabled() {
		t.Fatalf("good: %d", c)
	}
	if c := put(h, `{"retentionHours":0}`).Code; c != http.StatusNoContent || s.Enabled() {
		t.Fatalf("off: %d", c)
	}
}

func TestGetSinceFilters(t *testing.T) {
	s, _ := newOn(t)
	_ = s.Append("a", "s1", evs(1, 5)) // base+1s, base+5s
	_ = s.Append("b", "s2", evs(3))
	rec := httptest.NewRecorder()
	NewHandler(s).ServeHTTP(rec, httptest.NewRequest("GET", "/api/journal?since="+strconv.FormatInt(base.Add(3*time.Second).Unix(), 10), nil))
	if ct := rec.Header().Get("Content-Type"); ct != "application/x-ndjson" {
		t.Fatal(ct)
	}
	type line struct {
		Pane, Sid string
		Ev        Event
	}
	var got []line
	sc := bufio.NewScanner(rec.Body)
	for sc.Scan() {
		var l line
		if err := json.Unmarshal(sc.Bytes(), &l); err != nil {
			t.Fatal(err)
		}
		got = append(got, l)
	}
	if len(got) != 2 {
		t.Fatalf("got %+v", got)
	}
	rec = httptest.NewRecorder()
	NewHandler(s).ServeHTTP(rec, httptest.NewRequest("GET", "/api/journal?since=bad", nil))
	if n := strings.Count(rec.Body.String(), "\n"); n != 3 {
		t.Fatalf("invalid since should mean 0: %d", n)
	}
}
