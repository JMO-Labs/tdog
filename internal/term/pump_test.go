package term

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/frame"
)

// runPump starts pumpOutput and returns the channel of written frames.
func runPump(t *testing.T, chunks chan []byte) (chan []byte, <-chan bool) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	frames := make(chan []byte, 64)
	done := make(chan bool, 1)
	go func() {
		done <- pumpOutput(ctx, func(f []byte) error { frames <- f; return nil }, chunks)
	}()
	return frames, done
}

func nextFrame(t *testing.T, frames <-chan []byte) []byte {
	t.Helper()
	select {
	case f := <-frames:
		typ, p, err := frame.Decode(f)
		if err != nil || typ != frame.Output {
			t.Fatalf("bad frame %q: %v", f, err)
		}
		return p
	case <-time.After(2 * time.Second):
		t.Fatal("no frame")
		return nil
	}
}

func TestPumpCoalescesSmallChunks(t *testing.T) {
	chunks := make(chan []byte, 8)
	chunks <- []byte("ab")
	chunks <- []byte("cd")
	chunks <- []byte("ef")
	frames, _ := runPump(t, chunks)
	if got := nextFrame(t, frames); string(got) != "abcdef" {
		t.Fatalf("got %q, want one coalesced frame", got)
	}
	select {
	case f := <-frames:
		t.Fatalf("unexpected extra frame %q", f)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestPumpSplitsLargeBurst(t *testing.T) {
	chunks := make(chan []byte, 8)
	data := bytes.Repeat([]byte("x"), 40*1024)
	chunks <- data
	close(chunks)
	frames, done := runPump(t, chunks)
	if !<-done {
		t.Fatal("pump should report PTY closed")
	}
	close(frames)
	var total int
	for f := range frames {
		if len(f) > flushSize+1 {
			t.Fatalf("frame of %d bytes exceeds %d", len(f), flushSize+1)
		}
		total += len(f) - 1
	}
	if total != len(data) {
		t.Fatalf("got %d payload bytes, want %d", total, len(data))
	}
}

func TestPumpFlushesLoneChunkPromptly(t *testing.T) {
	chunks := make(chan []byte, 1)
	frames, _ := runPump(t, chunks)
	start := time.Now()
	chunks <- []byte("z")
	if got := nextFrame(t, frames); string(got) != "z" {
		t.Fatalf("got %q", got)
	}
	// flushAfter is 4 ms; allow scheduler slack on CI.
	if d := time.Since(start); d > 100*time.Millisecond {
		t.Fatalf("flush took %v", d)
	}
}
