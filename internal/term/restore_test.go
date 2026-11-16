package term

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/JMO-Labs/tdog/internal/journal"
)

// parkAndReturn parks r with the host reporting pos (tmux display output),
// then attaches (the unpark captures scr / capErr) and returns the gap rec.
func parkAndReturn(t *testing.T, r *parkRig, pos, scr string, capErr error) uint64 {
	t.Helper()
	r.h.set(func() { r.h.pos, r.h.scr, r.h.capErr = pos, scr, capErr })
	r.park(t)
	evs := r.events()
	rec := evs[len(evs)-1].Rec
	a, _, err := r.s.attachUnparked()
	if err != nil || a == nil {
		t.Fatalf("attach: %v", err)
	}
	t.Cleanup(func() { r.s.detach(a) })
	return rec
}

// ask sends jrnl-restore for rec and returns the error controls it replied.
func ask(r *parkRig, rec uint64) chan string {
	errs := make(chan string, 4)
	r.s.j.control([]byte(`{"type":"jrnl-restore","rec":`+itoa(rec)+`}`), func(f []byte) error {
		_, p, _ := frame.Decode(f)
		var v struct{ Type, Message string }
		_ = json.Unmarshal(p, &v)
		if v.Type == "error" {
			errs <- v.Message
		}
		return nil
	})
	return errs
}

// restored runs a restore for rec and returns the events it added.
func restored(t *testing.T, r *parkRig, rec uint64) []journal.Event {
	t.Helper()
	before := r.events()
	last := before[len(before)-1].Seq
	ask(r, rec)
	var got []journal.Event
	waitFor(t, func() bool { got = r.s.j.buf.Since(last); return len(got) > 0 })
	return got
}

func outText(t *testing.T, evs []journal.Event, rec uint64) string {
	t.Helper()
	var b strings.Builder
	for _, e := range evs {
		if e.Kind != journal.KindOut || e.Rec != rec {
			t.Fatalf("want only outs for rec %d, got %+v", rec, e)
		}
		b.WriteString(e.Text)
	}
	return b.String()
}

func failGap(t *testing.T, evs []journal.Event, rec uint64, why string) {
	t.Helper()
	g := evs[len(evs)-1]
	if g.Kind != journal.KindGap || g.Why != why || g.Rec <= rec {
		t.Fatalf("want gap %q, got %+v", why, evs)
	}
}

func TestRestoreByPositionKeepsRepeatedOutput(t *testing.T) {
	r := newParkRig(t)
	// The prompt was at line 4 (history 3 + cursor 1); the missed output
	// repeats the anchor lines, which must not cut it short.
	scr := "x\none\ntwo\nthree\n$ \none\ntwo\nthree\ntail\n\n\n"
	rec := parkAndReturn(t, r, "3 1\n", scr, nil)
	if got := outText(t, restored(t, r, rec), rec); got != "$\none\ntwo\nthree\ntail\n" {
		t.Fatalf("text = %q", got)
	}
}

func TestRestoreExcludesPostUnparkOutput(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "3 1\n", "x\none\ntwo\nthree\n$ \nmissed\n", nil)
	r.h.set(func() { r.h.scr = "x\none\ntwo\nthree\n$ \nmissed\npost-unpark\n" })
	r.h.say(t, "post-unpark\n")
	got := outText(t, restored(t, r, rec), rec)
	if got != "$\nmissed\n" {
		t.Fatalf("text = %q", got)
	}
	if n := r.h.count("capture-pane"); n != 1 {
		t.Fatalf("captured %d times, want once at unpark", n)
	}
}

func TestRestorePositionFailsSanityFallsBackToAnchor(t *testing.T) {
	r := newParkRig(t)
	// History was trimmed: line 4 is no longer just below the anchor.
	rec := parkAndReturn(t, r, "3 1\n", "a\nb\nc\nd\ne\nf\none\ntwo\nthree\nmissed\n", nil)
	if got := outText(t, restored(t, r, rec), rec); got != "missed\n" {
		t.Fatalf("text = %q", got)
	}
}

func TestRestoreAnchorWindow(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "", "one\n$ a\ntwo\n$ b\n$ c\nthree\nmissed\n", nil)
	if got := outText(t, restored(t, r, rec), rec); got != "missed\n" {
		t.Fatalf("text = %q", got)
	}
	r2 := newParkRig(t)
	rec = parkAndReturn(t, r2, "", "one\nA\nB\nC\ntwo\nthree\nmissed\n", nil)
	failGap(t, restored(t, r2, rec), rec, "restore failed: scrollback no longer reaches the gap")
}

func TestRestoreUsesLastAnchorOccurrence(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "", "one\ntwo\nthree\nstale\none\ntwo\nthree\nfresh\n", nil)
	if got := outText(t, restored(t, r, rec), rec); got != "fresh\n" {
		t.Fatalf("text = %q", got)
	}
}

func TestRestoreAnchorMissingGap(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "", "unrelated\nlines\n", nil)
	failGap(t, restored(t, r, rec), rec, "restore failed: scrollback no longer reaches the gap")
}

func TestRestoreCaptureErrorGap(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "", "", errors.New("no server"))
	failGap(t, restored(t, r, rec), rec, "restore failed: no server")
}

func TestRestoreNothingRecorded(t *testing.T) {
	r := newParkRig(t)
	r.h.set(func() { r.h.scr = "$ \n" })
	r.h.say(t, "\x1b]133;A\x07$ ") // a prompt, but no output yet
	waitFor(t, func() bool { return r.s.j.idle(time.Now().Add(time.Hour), parkAfter) })
	r.idleFor(parkAfter + time.Second)
	waitFor(t, r.parked)
	evs := r.events()
	rec := evs[len(evs)-1].Rec
	a, _, err := r.s.attachUnparked()
	if err != nil || a == nil {
		t.Fatalf("attach: %v", err)
	}
	defer r.s.detach(a)
	failGap(t, restored(t, r, rec), rec, "restore failed: nothing recorded before the disconnect to align with")
}

func TestRestoreCaptureExpires(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "3 1\n", "x\none\ntwo\nthree\n$ \n", nil)
	r.s.j.expireCaps(time.Now().Add(11 * time.Minute))
	failGap(t, restored(t, r, rec), rec, "restore failed: the host capture expired; restore within 10 minutes of reconnecting")
}

func TestRestoreSplitsLargeText(t *testing.T) {
	r := newParkRig(t)
	big := strings.Repeat("é€😀 wide runes ", 12000) // ~200 KiB on one line
	rec := parkAndReturn(t, r, "3 1\n", "x\none\ntwo\nthree\n$ \n"+big+"\n", nil)
	before := r.events()
	ask(r, rec)
	var got []journal.Event
	waitFor(t, func() bool { got = r.s.j.buf.Since(before[len(before)-1].Seq); return len(got) >= 4 })
	for _, e := range got {
		if len(e.Text) > 64<<10 || !utf8.ValidString(e.Text) {
			t.Fatalf("chunk of %d bytes, valid=%v", len(e.Text), utf8.ValidString(e.Text))
		}
	}
	if s := outText(t, got, rec); s != "$\n"+strings.TrimRight(big, " ")+"\n" {
		t.Fatalf("joined text differs (%d bytes)", len(s))
	}
}

func TestRestoreUnknownRecSendsErrorOnly(t *testing.T) {
	r := newParkRig(t)
	r.prompt(t)
	before := len(r.events())
	select {
	case msg := <-ask(r, 999):
		if !strings.Contains(msg, "restore failed") {
			t.Fatalf("msg %q", msg)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no error control")
	}
	if len(r.events()) != before {
		t.Fatal("unknown rec must not touch the journal")
	}
	// A plain (non-host) journal has nothing to restore either.
	j := newJrnl()
	var got []byte
	j.restore(1, func(f []byte) error { got = f; return nil })
	if len(got) == 0 || len(j.buf.Since(0)) != 0 {
		t.Fatalf("non-host: reply %q events %d", got, len(j.buf.Since(0)))
	}
}

func TestRestoreTwiceSecondIsUnknown(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "3 1\n", "x\none\ntwo\nthree\n$ \nmissed\n", nil)
	restored(t, r, rec)
	before := len(r.events())
	select {
	case <-ask(r, rec):
	case <-time.After(3 * time.Second):
		t.Fatal("second restore must reply an error")
	}
	if len(r.events()) != before {
		t.Fatal("second restore duplicated output")
	}
}

func TestChunksAlwaysProgress(t *testing.T) {
	done := make(chan []string, 1)
	go func() { done <- chunks(strings.Repeat("\x80", 70000), restoreChunk) }()
	select {
	case out := <-done:
		if len(out) != 2 || len(out[0])+len(out[1]) != 70000 {
			t.Fatalf("got %d chunks", len(out))
		}
	case <-time.After(3 * time.Second):
		t.Fatal("chunks did not terminate")
	}
}

func TestRestorePiecesValidAndCapped(t *testing.T) {
	for _, in := range []string{
		strings.Repeat("\x80", 70000),
		strings.Repeat("ab\xffé😀\n", 1<<20), // ~10 MiB, invalid bytes mixed in
	} {
		out := restorePieces(in)
		total := 0
		for _, c := range out {
			if len(c) > restoreChunk || !utf8.ValidString(c) {
				t.Fatalf("chunk of %d bytes, valid=%v", len(c), utf8.ValidString(c))
			}
			total += len(c)
		}
		if total > maxRestore+len(trimmedMark) {
			t.Fatalf("total %d over cap", total)
		}
		joined := strings.Join(out, "")
		if total > maxRestore && !strings.HasPrefix(joined, trimmedMark) {
			t.Fatal("trimmed text lacks the marker")
		}
	}
	big := strings.Repeat("x\n", 3<<20) + "newest\n"
	if j := strings.Join(restorePieces(big), ""); !strings.HasPrefix(j, trimmedMark) || !strings.HasSuffix(j, "newest\n") {
		t.Fatal("cap must keep the newest tail behind the marker")
	}
}

func parkCount(j *jrnl) int {
	j.mu.Lock()
	defer j.mu.Unlock()
	return len(j.parks)
}

func TestStoredCaptureIsBounded(t *testing.T) {
	j := newJrnl()
	j.parks = map[uint64]*parkInfo{1: {pos: -1}}
	j.storeCapture(1, strings.Repeat("ab\xffé\n", 2<<20), nil, time.Now()) // ~12 MiB
	scr := j.parks[1].scr
	if len(scr) > maxRestore+len(trimmedMark) || !utf8.ValidString(scr) {
		t.Fatalf("stored %d bytes, valid=%v", len(scr), utf8.ValidString(scr))
	}
}

func TestForgetDropsParksAndCaptures(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "3 1\n", "x\none\ntwo\nthree\n$ \nsecret\n", nil)
	r.s.j.control([]byte(`{"type":"jrnl-forget"}`), nil)
	if parkCount(r.s.j) != 0 {
		t.Fatal("forget kept stored captures")
	}
	select {
	case msg := <-ask(r, rec):
		if msg != whyUnknown {
			t.Fatalf("msg %q", msg)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no error control")
	}
	time.Sleep(20 * time.Millisecond)
	if evs := r.events(); len(evs) != 0 {
		t.Fatalf("restore after forget wrote %+v", evs)
	}
}

func TestKillAndStopDropCaptures(t *testing.T) {
	r := newParkRig(t)
	parkAndReturn(t, r, "3 1\n", "x\none\ntwo\nthree\n$ \n", nil)
	r.s.j.kill()
	if parkCount(r.s.j) != 0 {
		t.Fatal("kill kept stored captures")
	}
	j := newJrnl()
	j.parks = map[uint64]*parkInfo{1: {pos: -1, hasCap: true, scr: "secret"}}
	j.stop()
	if parkCount(j) != 0 {
		t.Fatal("stop kept stored captures")
	}
}

func TestRestoreWithRecordingOffSendsError(t *testing.T) {
	r := newParkRig(t)
	rec := parkAndReturn(t, r, "3 1\n", "x\none\ntwo\nthree\n$ \nmissed\n", nil)
	r.s.j.control([]byte(`{"type":"jrnl-record","on":false}`), nil)
	select {
	case msg := <-ask(r, rec):
		if msg != "Recording is off for this pane." {
			t.Fatalf("msg %q", msg)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no error control")
	}
	time.Sleep(20 * time.Millisecond)
	if evs := r.events(); len(evs) != 0 {
		t.Fatalf("wrote %+v", evs)
	}
}
