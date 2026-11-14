package term

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/JMO-Labs/tdog/internal/frame"
)

type failWriter struct{ n int }

func (w *failWriter) Write([]byte) (int, error) { w.n++; return 0, errors.New("boom") }

// feed returns a read func yielding the given messages, then err.
func feed(msgs [][]byte, err error) func(context.Context) ([]byte, error) {
	i := 0
	return func(context.Context) ([]byte, error) {
		if i < len(msgs) {
			i++
			return msgs[i-1], nil
		}
		return nil, err
	}
}

func TestPumpInputWriteErrorReturns(t *testing.T) {
	w := &failWriter{}
	msgs := [][]byte{frame.Encode(frame.Input, []byte("a")), frame.Encode(frame.Input, []byte("b"))}
	pumpInput(context.Background(), feed(msgs, errors.New("eof")), w, nil, nil)
	if w.n != 1 {
		t.Fatalf("writes = %d, want 1 (return after first failure)", w.n)
	}
}

func TestPumpInputSkipsBadFrames(t *testing.T) {
	var buf bytes.Buffer
	msgs := [][]byte{{}, frame.Encode(frame.Input, []byte("ok"))}
	pumpInput(context.Background(), feed(msgs, errors.New("eof")), &buf, nil, nil)
	if buf.String() != "ok" {
		t.Fatalf("got %q, want %q", buf.String(), "ok")
	}
}

func TestPumpInputReadErrorReturns(t *testing.T) {
	var buf bytes.Buffer
	pumpInput(context.Background(), feed(nil, errors.New("closed")), &buf, nil, nil)
	if buf.Len() != 0 {
		t.Fatalf("unexpected write %q", buf.String())
	}
}

func TestPumpInputResize(t *testing.T) {
	var cols, rows uint16
	var buf bytes.Buffer
	msgs := [][]byte{frame.Encode(frame.Resize, []byte(`{"cols":100,"rows":30}`))}
	pumpInput(context.Background(), feed(msgs, errors.New("eof")), &buf, func(c, r uint16) { cols, rows = c, r }, nil)
	if cols != 100 || rows != 30 {
		t.Fatalf("resize = %dx%d", cols, rows)
	}
}

func TestPumpInputPingRepliesPong(t *testing.T) {
	var got [][]byte
	msgs := [][]byte{
		frame.Encode(frame.Control, []byte(`{"type":"ack","bytes":5}`)),
		frame.Encode(frame.Control, []byte(`{"type":"ping","t":7}`)),
	}
	reply := func(f []byte) error { got = append(got, f); return nil }
	pumpInput(context.Background(), feed(msgs, errors.New("eof")), &bytes.Buffer{}, nil, reply)
	if len(got) != 1 || string(got[0][1:]) != `{"type":"pong","t":7}` {
		t.Fatalf("replies = %q", got)
	}
}
