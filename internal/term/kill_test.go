package term

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func killMux(r *rig) *http.ServeMux {
	mux := http.NewServeMux()
	r.reg.RegisterKill(mux)
	return mux
}

func postKill(mux *http.ServeMux, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, nil))
	return rec
}

func killCount(t *testing.T, rec *httptest.ResponseRecorder) int {
	t.Helper()
	var v struct {
		Killed int `json:"killed"`
	}
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &v) != nil {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	return v.Killed
}

func waitGone(t *testing.T, r *rig) {
	t.Helper()
	deadline := time.Now().Add(hupGrace + 5*time.Second)
	for len(r.reg.List()) > 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if n := len(r.reg.List()); n != 0 {
		t.Fatalf("%d sessions left", n)
	}
}

func lastAudit(r *rig, event string) (count int, found bool) {
	for _, e := range r.log.Recent(50) {
		if e.Event == event && e.Count != nil {
			return *e.Count, true
		}
	}
	return 0, false
}

func TestKillOneSessionNotifiesClient(t *testing.T) {
	r := newRig(t)
	c, id := r.start("")
	_, other := r.start("")
	rec := postKill(killMux(r), "/api/sessions/"+id+"/kill")
	if n := killCount(t, rec); n != 1 {
		t.Fatalf("killed %d", n)
	}
	_, ctl := readCtl(t, r.ctx, c, "", true)
	if !strings.Contains(string(ctl), `"type":"killed"`) {
		t.Fatalf("control %q", ctl)
	}
	time.Sleep(100 * time.Millisecond)
	if r.reg.get(other) == nil {
		t.Fatal("other session was killed")
	}
	if n, ok := lastAudit(r, "kill"); !ok || n != 1 {
		t.Fatalf("audit %d %v", n, ok)
	}
}

func TestKillUnknownID404(t *testing.T) {
	r := newRig(t)
	rec := postKill(killMux(r), "/api/sessions/nope/kill")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestKillSceneOnlyThatScene(t *testing.T) {
	r := newRig(t)
	r.start("scene=a")
	r.start("scene=a")
	_, b := r.start("scene=b")
	rec := postKill(killMux(r), "/api/scenes/a/kill")
	if n := killCount(t, rec); n != 2 {
		t.Fatalf("killed %d", n)
	}
	deadline := time.Now().Add(hupGrace + 5*time.Second)
	for len(r.reg.List()) > 1 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if l := r.reg.List(); len(l) != 1 || l[0].ID != b {
		t.Fatalf("left %+v", l)
	}
	if n, ok := lastAudit(r, "kill_scene"); !ok || n != 2 {
		t.Fatalf("audit %d %v", n, ok)
	}
}

func TestKillAll(t *testing.T) {
	r := newRig(t)
	r.start("scene=a")
	r.start("scene=b")
	if n := killCount(t, postKill(killMux(r), "/api/sessions/kill-all")); n != 2 {
		t.Fatalf("killed %d", n)
	}
	waitGone(t, r)
	if n, ok := lastAudit(r, "kill_all"); !ok || n != 2 {
		t.Fatalf("audit %d %v", n, ok)
	}
}

func TestKillAllEmptyAuditsZero(t *testing.T) {
	r := newRig(t)
	if n := killCount(t, postKill(killMux(r), "/api/sessions/kill-all")); n != 0 {
		t.Fatalf("killed %d", n)
	}
	if n, ok := lastAudit(r, "kill_all"); !ok || n != 0 {
		t.Fatalf("audit %d %v", n, ok)
	}
}
