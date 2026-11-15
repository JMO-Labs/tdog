package term

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/JMO-Labs/tdog/internal/journal"
	"github.com/coder/websocket"
)

// mark runs a shell command printing text between OSC 133 C and D marks.
func mark(t *testing.T, r *rig, c *websocket.Conn, text string) {
	t.Helper()
	send(t, r.ctx, c, frame.Input, `printf '\033]133;C\007%s\n\033]133;D;0\007' '`+text+"'\n")
}

func ctl(t *testing.T, r *rig, c *websocket.Conn, js string) {
	t.Helper()
	send(t, r.ctx, c, frame.Control, js)
}

// readJournal reads frames until a journal event whose text contains want
// arrives. It returns all journal events seen and, per frame, the index of the
// first Output frame holding want (-1 if none) plus the Journal frame index.
func readJournal(t *testing.T, ctx context.Context, c *websocket.Conn, want string) (evs []journal.Event, outIdx, jrnlIdx int) {
	t.Helper()
	outIdx, jrnlIdx = -1, -1
	for i := 0; ; i++ {
		_, data, err := c.Read(ctx)
		if err != nil {
			t.Fatalf("read: %v (events %+v)", err, evs)
		}
		typ, p, err := frame.Decode(data)
		if err != nil {
			t.Fatal(err)
		}
		switch typ {
		case frame.Output:
			if outIdx < 0 && strings.Contains(string(p), want+"\r") {
				outIdx = i
			}
		case frame.Journal:
			var got []journal.Event
			if err := json.Unmarshal(p, &got); err != nil {
				t.Fatal(err)
			}
			evs = append(evs, got...)
			for _, e := range got {
				if strings.Contains(e.Text, want) {
					jrnlIdx = i
					return
				}
			}
		}
	}
}

func maxSeq(evs []journal.Event) (m uint64) {
	for _, e := range evs {
		m = max(m, e.Seq)
	}
	return m
}

func jWait(t *testing.T, what string, ok func() bool) {
	t.Helper()
	for end := time.Now().Add(5 * time.Second); time.Now().Before(end); time.Sleep(20 * time.Millisecond) {
		if ok() {
			return
		}
	}
	t.Fatalf("timeout: %s", what)
}

func jrnlOf(t *testing.T, r *rig, id string) *jrnl {
	t.Helper()
	s := r.reg.get(id)
	if s == nil || s.j == nil {
		t.Fatal("no session journal")
	}
	return s.j
}

func TestJournalFrameDelivered(t *testing.T) {
	r := newRig(t)
	c, _ := r.start("")
	mark(t, r, c, "hel''lo")
	evs, _, jr := readJournal(t, r.ctx, c, "hello")
	if jr < 0 || len(evs) == 0 || evs[0].Kind != journal.KindStart && evs[0].Kind != journal.KindOut {
		t.Fatalf("journal frame %d, events %+v", jr, evs)
	}
}

func TestJournalReconnectResendsOnlyUnacked(t *testing.T) {
	r := newRig(t)
	c, id := r.start("")
	mark(t, r, c, "on''e")
	evs, _, _ := readJournal(t, r.ctx, c, "one")
	n := maxSeq(evs)
	ctl(t, r, c, `{"type":"jrnl-ack","seq":`+itoa(n)+`}`)
	jWait(t, "ack applied", func() bool {
		for _, e := range jrnlOf(t, r, id).buf.Since(0) {
			if e.Seq <= n {
				return false
			}
		}
		return true
	})
	mark(t, r, c, "tw''o")
	c2, err := r.dial("id=" + id)
	if err != nil {
		t.Fatal(err)
	}
	got, _, _ := readJournal(t, r.ctx, c2, "two")
	for _, e := range got {
		if e.Seq <= n || strings.Contains(e.Text, "one") {
			t.Fatalf("resent acked event %+v (acked %d)", e, n)
		}
	}
}

func TestJournalRecordOffWipesAndStops(t *testing.T) {
	r := newRig(t)
	c, id := r.start("")
	j := jrnlOf(t, r, id)
	mark(t, r, c, "a''a")
	evs, _, _ := readJournal(t, r.ctx, c, "aa")
	ctl(t, r, c, `{"type":"jrnl-record","on":false}`)
	jWait(t, "wipe", func() bool { return len(j.buf.Since(0)) == 0 })
	mark(t, r, c, "b''b")
	readUntil(t, r.ctx, c, "bb\r")
	time.Sleep(2 * journalQuiet)
	if got := j.buf.Since(0); len(got) != 0 {
		t.Fatalf("recorded while off: %+v", got)
	}
	ctl(t, r, c, `{"type":"jrnl-record","on":true}`)
	mark(t, r, c, "c''c")
	jWait(t, "resumed", func() bool {
		for _, e := range j.buf.Since(0) {
			if strings.Contains(e.Text, "cc") {
				return e.Seq > maxSeq(evs)
			}
		}
		return false
	})
}

func TestJournalForgetWipesAndKeepsRecording(t *testing.T) {
	r := newRig(t)
	c, id := r.start("")
	j := jrnlOf(t, r, id)
	mark(t, r, c, "a''a")
	readJournal(t, r.ctx, c, "aa")
	ctl(t, r, c, `{"type":"jrnl-forget"}`)
	jWait(t, "wipe", func() bool { return len(j.buf.Since(0)) == 0 })
	mark(t, r, c, "b''b")
	jWait(t, "records after forget", func() bool {
		for _, e := range j.buf.Since(0) {
			if strings.Contains(e.Text, "bb") {
				return true
			}
		}
		return false
	})
}

func TestJournalFlushEmitsHeldPartialLine(t *testing.T) {
	j := newJrnl()
	defer j.stop()
	j.feed([]byte("\x1b]133;C\x07partial"))
	has := func() bool {
		for _, e := range j.buf.Since(0) {
			if strings.Contains(e.Text, "partial") {
				return true
			}
		}
		return false
	}
	if has() {
		t.Fatal("partial line emitted before flush")
	}
	j.start()
	jWait(t, "flush after quiet", has)
}

func TestJournalControlIgnoresJunk(t *testing.T) {
	j := newJrnl()
	defer j.stop()
	j.feed([]byte("\x1b]133;C\x07x\n"))
	for _, p := range []string{`{`, `{"type":"nope"}`, `{"type":"jrnl-record"}`, `{"type":"ping"}`} {
		j.control([]byte(p))
	}
	if len(j.buf.Since(0)) == 0 {
		t.Fatal("junk control changed state")
	}
	var nilJ *jrnl
	nilJ.feed(nil)
	nilJ.control([]byte(`{"type":"jrnl-forget"}`))
	nilJ.start()
	nilJ.stop()
}

// Auth is unchanged: the journal adds no route, and the WS upgrade stays behind
// the session check (internal/server TestSecuredRequiresSession covers /ws/term).
func TestJournalAddsNoUnauthenticatedPath(t *testing.T) {
	h := Handler("/bin/sh")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/ws/term", nil))
	if rec.Code < 400 {
		t.Fatalf("got %d", rec.Code)
	}
}

func itoa(n uint64) string { return strconv.FormatUint(n, 10) }

func cmdRun(j *jrnl, text string) {
	j.feed([]byte("\x1b]133;C\x07" + text + "\n\x1b]133;D;0\x07"))
}

func TestJournalRecAndSeqMonotonicAcrossRecordToggle(t *testing.T) {
	j := newJrnl()
	cmdRun(j, "one")
	old := j.buf.Since(0)
	j.control([]byte(`{"type":"jrnl-record","on":false}`))
	j.control([]byte(`{"type":"jrnl-record","on":true}`))
	cmdRun(j, "two")
	all := j.buf.Since(0)
	if len(old) == 0 || len(all) == 0 {
		t.Fatalf("old %d new %d", len(old), len(all))
	}
	var oldRec, oldSeq uint64
	for _, e := range old {
		oldRec, oldSeq = max(oldRec, e.Rec), max(oldSeq, e.Seq)
	}
	for _, e := range all {
		if e.Rec <= oldRec || e.Seq <= oldSeq {
			t.Fatalf("event %+v not above old rec %d seq %d", e, oldRec, oldSeq)
		}
	}
}

func TestJournalAckClampedToSent(t *testing.T) {
	j := newJrnl()
	cmdRun(j, "one")
	n := len(j.buf.Since(0))
	j.control([]byte(`{"type":"jrnl-ack","seq":999}`))
	if len(j.buf.Since(0)) != n {
		t.Fatal("bogus ack freed unsent events")
	}
	first := j.buf.Since(0)[0].Seq
	j.mu.Lock()
	j.sent = first
	j.mu.Unlock()
	j.control([]byte(`{"type":"jrnl-ack","seq":999}`))
	if got := j.buf.Since(0); len(got) != n-1 {
		t.Fatalf("want %d events left, got %d", n-1, len(got))
	}
}
