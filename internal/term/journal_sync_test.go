package term

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/journal"
)

func syncJrnl(t *testing.T, pane string) (*jrnl, *journal.Store) {
	t.Helper()
	st := journal.NewStore(t.TempDir())
	if err := st.SetRetention(12); err != nil {
		t.Fatal(err)
	}
	j := newJrnl()
	j.store, j.sid, j.pane = st, "sid1", func() string { return pane }
	return j, st
}

func TestJournalAckAppendsExactlyAckedOnce(t *testing.T) {
	j, st := syncJrnl(t, "p1")
	cmdRun(j, "one")
	cmdRun(j, "two")
	all := j.buf.Since(0)
	j.mu.Lock()
	j.sent = all[len(all)-1].Seq
	j.mu.Unlock()
	mid := all[1].Seq
	j.control([]byte(`{"type":"jrnl-ack","seq":`+itoa(mid)+`}`), nil)
	j.control([]byte(`{"type":"jrnl-ack","seq":`+itoa(mid)+`}`), nil) // repeat: no dupes
	rows := st.Read(time.Unix(0, 0))
	if len(rows) != 2 {
		t.Fatalf("want 2 rows, got %+v", rows)
	}
	j.control([]byte(`{"type":"jrnl-ack","seq":999}`), nil) // clamped to sent
	if rows = st.Read(time.Unix(0, 0)); len(rows) != len(all) {
		t.Fatalf("want %d rows, got %d", len(all), len(rows))
	}
	for i, r := range rows {
		if r.Pane != "p1" || r.Sid != "sid1" || r.Ev.Seq != all[i].Seq {
			t.Fatalf("row %d: %+v", i, r)
		}
	}
}

func TestJournalAckWithoutPaneOrSyncDoesNotAppend(t *testing.T) {
	j, st := syncJrnl(t, "")
	cmdRun(j, "one")
	j.mu.Lock()
	j.sent = 999
	j.mu.Unlock()
	j.control([]byte(`{"type":"jrnl-ack","seq":999}`), nil)
	if rows := st.Read(time.Unix(0, 0)); len(rows) != 0 {
		t.Fatalf("no pane must not sync: %+v", rows)
	}
	if len(j.buf.Since(0)) != 0 {
		t.Fatal("ack must still free the buffer")
	}
}

func TestJournalForgetDeletesPaneFiles(t *testing.T) {
	j, st := syncJrnl(t, "p1")
	_ = st.Append("p1", "s", []journal.Event{{Seq: 1, At: time.Now()}})
	_ = st.Append("p2", "s", []journal.Event{{Seq: 1, At: time.Now()}})
	j.control([]byte(`{"type":"jrnl-forget"}`), nil)
	rows := st.Read(time.Unix(0, 0))
	if len(rows) != 1 || rows[0].Pane != "p2" {
		t.Fatalf("rows %+v", rows)
	}
}

func TestKillDeletesOnlyThatPaneInSameScene(t *testing.T) {
	r := newRig(t)
	dir := t.TempDir()
	st := journal.NewStore(dir)
	if err := st.SetRetention(12); err != nil {
		t.Fatal(err)
	}
	r.reg.SetJournalStore(st)
	_, id1 := r.start("scene=S&pane=p1")
	_, id2 := r.start("scene=S&pane=p2")
	_, id3 := r.start("scene=S&pane=../evil")
	_ = id3
	for _, p := range []string{"p1", "p2"} {
		_ = st.Append(p, "s", []journal.Event{{Seq: 1, At: time.Now()}})
	}
	_ = id2
	postKill(killMux(r), "/api/sessions/"+id1+"/kill")
	if _, err := os.Stat(filepath.Join(dir, "journal", "p1.jsonl")); err == nil {
		t.Fatal("p1 survived kill")
	}
	if _, err := os.Stat(filepath.Join(dir, "journal", "p2.jsonl")); err != nil {
		t.Fatal("p2 deleted by sibling kill")
	}
	postKill(killMux(r), "/api/scenes/S/kill")
	if _, err := os.Stat(filepath.Join(dir, "journal", "p2.jsonl")); err == nil {
		t.Fatal("p2 survived scene kill")
	}
	waitGone(t, r)
}

func TestReattachKeepsOriginalPane(t *testing.T) {
	r := newRig(t)
	_, id := r.start("pane=p1")
	c, err := r.dial("id=" + id + "&pane=p9")
	if err != nil {
		t.Fatal(err)
	}
	_ = c
	time.Sleep(100 * time.Millisecond)
	if got := r.reg.get(id).paneID(); got != "p1" {
		t.Fatalf("pane %q", got)
	}
}

// setSent pretends everything buffered was streamed.
func setSent(j *jrnl) {
	evs := j.buf.Since(0)
	j.mu.Lock()
	j.sent = evs[len(evs)-1].Seq
	j.mu.Unlock()
}

func TestAckRacingKillDoesNotResurrectFiles(t *testing.T) {
	j, st := syncJrnl(t, "p1")
	cmdRun(j, "one")
	setSent(j)
	done := make(chan struct{})
	j.beforeAppend = func() { // kill lands between the ack's checks and its Append
		go func() { j.kill(); close(done) }()
		time.Sleep(50 * time.Millisecond)
	}
	j.control([]byte(`{"type":"jrnl-ack","seq":999999}`), nil)
	<-done
	if rows := st.Read(time.Unix(0, 0)); len(rows) != 0 {
		t.Fatalf("files resurrected: %+v", rows)
	}
	j.beforeAppend = nil
	cmdRun(j, "two")
	setSent(j)
	j.control([]byte(`{"type":"jrnl-ack","seq":999999}`), nil)
	if rows := st.Read(time.Unix(0, 0)); len(rows) != 0 {
		t.Fatalf("ack after kill synced: %+v", rows)
	}
}

func TestAckRacingForgetDoesNotResurrectThenSyncsAgain(t *testing.T) {
	j, st := syncJrnl(t, "p1")
	cmdRun(j, "one")
	setSent(j)
	done := make(chan struct{})
	j.beforeAppend = func() {
		go func() { j.control([]byte(`{"type":"jrnl-forget"}`), nil); close(done) }()
		time.Sleep(50 * time.Millisecond)
	}
	j.control([]byte(`{"type":"jrnl-ack","seq":999999}`), nil)
	<-done
	if rows := st.Read(time.Unix(0, 0)); len(rows) != 0 {
		t.Fatalf("files resurrected: %+v", rows)
	}
	j.beforeAppend = nil
	cmdRun(j, "two")
	setSent(j)
	j.control([]byte(`{"type":"jrnl-ack","seq":999999}`), nil)
	if rows := st.Read(time.Unix(0, 0)); len(rows) == 0 {
		t.Fatal("sync did not resume after forget")
	}
}

func TestKillDuringForgetStaysKilled(t *testing.T) {
	j, st := syncJrnl(t, "p1")
	cmdRun(j, "one")
	setSent(j)
	j.afterForgetDelete = func() { j.kill() } // kill lands mid-forget
	j.control([]byte(`{"type":"jrnl-forget"}`), nil)
	cmdRun(j, "two")
	setSent(j)
	j.control([]byte(`{"type":"jrnl-ack","seq":999999}`), nil)
	if rows := st.Read(time.Unix(0, 0)); len(rows) != 0 {
		t.Fatalf("killed pane resumed syncing: %+v", rows)
	}
}

func TestBlockedAppendDoesNotBlockFeed(t *testing.T) {
	j, _ := syncJrnl(t, "p1")
	cmdRun(j, "one")
	setSent(j)
	in, release := make(chan struct{}), make(chan struct{})
	j.beforeAppend = func() { close(in); <-release }
	acked := make(chan struct{})
	go func() { j.control([]byte(`{"type":"jrnl-ack","seq":999999}`), nil); close(acked) }()
	<-in // ack is now stuck where Append would be
	fed := make(chan struct{})
	go func() { cmdRun(j, "two"); close(fed) }()
	select {
	case <-fed:
	case <-time.After(2 * time.Second):
		t.Fatal("feed blocked behind a slow Append")
	}
	close(release)
	<-acked
}
