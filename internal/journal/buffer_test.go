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
	wg.Add(2)
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
	wg.Wait()
}
