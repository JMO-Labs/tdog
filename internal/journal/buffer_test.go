package journal

import (
	"bytes"
	"fmt"
	"sync"
	"testing"
	"time"
)

func evN(seq uint64, text string) Event {
	return Event{Seq: seq, Kind: KindOut, Rec: seq, Text: text, At: time.Unix(int64(seq), 0).UTC()}
}

func TestBufferRoundTrip(t *testing.T) {
	b := NewBuffer(1 << 20)
	b.Add(evN(1, "a"))
	b.Add(evN(2, "b"))
	got := b.Since(0)
	if len(got) != 2 || got[0].Text != "a" || got[1].Seq != 2 {
		t.Fatalf("got %+v", got)
	}
	if got := b.Since(1); len(got) != 1 || got[0].Seq != 2 {
		t.Fatalf("since 1: %+v", got)
	}
}

func TestBufferAck(t *testing.T) {
	b := NewBuffer(1 << 20)
	for i := uint64(1); i <= 3; i++ {
		b.Add(evN(i, "x"))
	}
	b.Ack(2)
	got := b.Since(0)
	if len(got) != 1 || got[0].Seq != 3 {
		t.Fatalf("got %+v", got)
	}
}

func TestBufferOverCapGap(t *testing.T) {
	b := NewBuffer(2000)
	txt := string(bytes.Repeat([]byte("z"), 300))
	for i := uint64(1); i <= 30; i++ {
		b.Add(evN(i, txt))
	}
	got := b.Since(0)
	if len(got) < 2 || got[0].Kind != KindGap || got[0].Why != "buffer full" {
		t.Fatalf("got %+v", got)
	}
	gaps := 0
	for i, e := range got {
		if e.Kind == KindGap {
			gaps++
		}
		if i > 0 && e.Seq <= got[i-1].Seq {
			t.Fatalf("non-monotonic at %d", i)
		}
	}
	if gaps != 1 {
		t.Fatalf("gaps=%d", gaps)
	}
	if got[len(got)-1].Seq != 30 {
		t.Fatalf("newest lost")
	}
	if got[0].Seq != got[1].Seq-1 || got[0].Rec != got[0].Seq {
		t.Fatalf("gap seq/rec wrong: %+v %+v", got[0], got[1])
	}
	if b.size > 2000 {
		t.Fatalf("size %d over cap", b.size)
	}
	// Ack of gap seq frees the gap.
	b.Ack(got[0].Seq)
	if g := b.Since(0); g[0].Kind == KindGap {
		t.Fatal("gap not acked")
	}
}

func TestBufferHugeEventKeepsOnlyGap(t *testing.T) {
	b := NewBuffer(500)
	b.Add(evN(1, string(bytes.Repeat([]byte("q"), 5000))))
	got := b.Since(0)
	if len(got) != 1 || got[0].Kind != KindGap || got[0].Seq != 1 {
		t.Fatalf("got %+v", got)
	}
}

func TestBufferEncrypted(t *testing.T) {
	b := NewBuffer(1 << 20)
	secret := "super-secret-plaintext"
	b.Add(evN(1, secret))
	for _, c := range b.chunks {
		if bytes.Contains(c.data, []byte(secret)) {
			t.Fatal("plaintext in sealed chunk")
		}
	}
}

func TestBufferWipe(t *testing.T) {
	b := NewBuffer(1 << 20)
	b.Add(evN(1, "a"))
	b.Wipe()
	if got := b.Since(0); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
	b.Add(evN(2, "b")) // re-keys lazily
	if got := b.Since(0); len(got) != 1 || got[0].Text != "b" {
		t.Fatalf("after rekey: %+v", got)
	}
}

func TestBufferCorruptChunkSkipped(t *testing.T) {
	b := NewBuffer(1 << 20)
	b.Add(evN(1, "a"))
	b.Add(evN(2, "b"))
	b.chunks[0].data[len(b.chunks[0].data)-1] ^= 0xff
	got := b.Since(0)
	if len(got) != 1 || got[0].Seq != 2 {
		t.Fatalf("got %+v", got)
	}
}

func TestBufferConcurrent(t *testing.T) {
	b := NewBuffer(4000)
	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		for i := uint64(1); i <= 500; i++ {
			b.Add(evN(i, fmt.Sprint("line", i)))
		}
	}()
	go func() {
		defer wg.Done()
		for i := uint64(1); i <= 500; i++ {
			b.Since(0)
			b.Ack(i / 2)
		}
	}()
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			b.Wipe()
			time.Sleep(time.Microsecond)
		}
	}()
	wg.Wait()
	b.Since(0) // must not panic
}

// fillGap returns a buffer with a gap at the front and seqs 1..n added.
func fillGap(t *testing.T) (*Buffer, []Event) {
	t.Helper()
	b := NewBuffer(2000)
	txt := string(bytes.Repeat([]byte("z"), 300))
	for i := uint64(1); i <= 30; i++ {
		b.Add(evN(i, txt))
	}
	got := b.Since(0)
	if got[0].Kind != KindGap {
		t.Fatalf("no gap: %+v", got[0])
	}
	return b, got
}

func TestBufferSinceInsideDropped(t *testing.T) {
	b, all := fillGap(t)
	k := all[0].Seq - 1 // inside dropped range
	got := b.Since(k)
	if len(got) != len(all) || got[0].Kind != KindGap {
		t.Fatalf("got %d want %d first %+v", len(got), len(all), got[0])
	}
}

func TestBufferSinceAtOrPastGap(t *testing.T) {
	b, all := fillGap(t)
	got := b.Since(all[0].Seq)
	if len(got) != len(all)-1 || got[0].Kind == KindGap || got[0].Seq != all[1].Seq {
		t.Fatalf("got %+v", got)
	}
}

func TestBufferAckPastGapKeepsLater(t *testing.T) {
	b, all := fillGap(t)
	b.Ack(all[0].Seq + 1)
	got := b.Since(0)
	if len(got) != len(all)-2 || got[0].Kind == KindGap || got[0].Seq != all[2].Seq {
		t.Fatalf("got %+v", got)
	}
}

func TestBufferGapAtRec(t *testing.T) {
	b := NewBuffer(900)
	at := time.Date(2026, 3, 4, 5, 6, 7, 8, time.UTC)
	for i := uint64(1); i <= 10; i++ {
		e := evN(i, string(bytes.Repeat([]byte("y"), 200)))
		e.Rec = 100 + i
		e.At = at.Add(time.Duration(i) * time.Hour)
		b.Add(e)
	}
	got := b.Since(0)
	g := got[0]
	if g.Kind != KindGap || g.Rec != 100+g.Seq || !g.At.Equal(at.Add(time.Duration(g.Seq)*time.Hour)) {
		t.Fatalf("gap %+v", g)
	}
}

func TestBufferSizeAccounting(t *testing.T) {
	b, _ := fillGap(t)
	sum := len(b.gap.data)
	for _, c := range b.chunks {
		sum += len(c.data)
	}
	if sum != b.size {
		t.Fatalf("sum %d size %d", sum, b.size)
	}
}

func TestBufferGapNoPlaintext(t *testing.T) {
	b := NewBuffer(1000)
	for i := uint64(1); i <= 10; i++ {
		b.Add(evN(i, "plain-secret-text-"+string(bytes.Repeat([]byte("p"), 200))))
	}
	if b.gap == nil || bytes.Contains(b.gap.data, []byte("buffer full")) || bytes.Contains(b.gap.data, []byte("gap")) {
		t.Fatal("gap missing or plaintext")
	}
}

func TestBufferSeqBoundToCiphertext(t *testing.T) {
	b := NewBuffer(1 << 20)
	b.Add(evN(1, "a"))
	b.Add(evN(2, "b"))
	b.chunks[0].seq, b.chunks[1].seq = b.chunks[1].seq, b.chunks[0].seq
	if got := b.Since(0); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestBufferParserOverflowEndToEnd(t *testing.T) {
	now := time.Unix(1000, 0)
	p := NewParser(func() time.Time { return now })
	b := NewBuffer(4096)
	var last Event
	var wantSeq uint64
	add := func(evs []Event) {
		for _, e := range evs {
			b.Add(e)
			last = e
			wantSeq = e.Seq
		}
	}
	add(p.Feed([]byte("\x1b]133;B\x07longcmd\x1b]133;C\x07")))
	for i := 0; i < 300; i++ {
		add(p.Feed([]byte(fmt.Sprintf("line %03d %s\r\n", i, bytes.Repeat([]byte("o"), 80)))))
	}
	add(p.Feed([]byte("\x1b]133;D;0\x07")))
	if last.Kind != KindEnd {
		t.Fatalf("last %+v", last)
	}
	got := b.Since(1)
	if len(got) < 3 || got[0].Kind != KindGap || got[0].Why != "buffer full" {
		t.Fatalf("first %+v", got[0])
	}
	if got[len(got)-1].Kind != KindEnd || got[len(got)-1].Seq != wantSeq {
		t.Fatalf("end lost: %+v", got[len(got)-1])
	}
	o := got[len(got)-2]
	if o.Kind != KindOut || !bytes.Contains([]byte(o.Text), []byte("line 299")) {
		t.Fatalf("newest out %+v", o)
	}
}
