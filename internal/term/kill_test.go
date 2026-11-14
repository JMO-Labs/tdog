package term

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func killReq(t *testing.T, r *Registry, id string) int {
	t.Helper()
	mux := http.NewServeMux()
	mux.Handle("POST /api/sessions/{id}/kill", r.KillHandler())
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("POST", "/api/sessions/"+id+"/kill", nil))
	return rec.Code
}

func TestKillHandler(t *testing.T) {
	r := newRig(t)
	c, id := r.start("")
	_ = c.CloseNow()
	if got := killReq(t, r.reg, id); got != http.StatusNoContent {
		t.Fatalf("kill status %d", got)
	}
	waitFor(t, func() bool { return len(r.reg.List()) == 0 })
	if got := killReq(t, r.reg, id); got != http.StatusNotFound {
		t.Fatalf("second kill status %d", got)
	}
}
