package term

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/JMO-Labs/tdog/internal/frame"
	"github.com/JMO-Labs/tdog/internal/journal"
)

const (
	journalTick  = 100 * time.Millisecond // serve loop send cadence
	journalQuiet = 250 * time.Millisecond // idle time before a partial line is flushed
)

// jrnl owns a session's parser and encrypted event buffer. All methods are
// nil-safe so sessions built without a journal still work.
type jrnl struct {
	buf *journal.Buffer

	mu              sync.Mutex // guards the fields below
	p               *journal.Parser
	on              bool
	base            uint64 // seq offset so a fresh parser continues the old numbering
	max             uint64 // highest seq added
	recBase, recMax uint64 // Rec offset/highest so a fresh parser's ids stay unique
	sent            uint64 // highest seq streamed to a client; acks are clamped to it
	last            time.Time
	done            chan struct{}
	once            sync.Once
}

func newJrnl() *jrnl {
	return &jrnl{buf: journal.NewBuffer(journalCap), p: journal.NewParser(time.Now), on: true, done: make(chan struct{})}
}

// add stores events; callers hold j.mu.
func (j *jrnl) add(evs []journal.Event) {
	for _, e := range evs {
		e.Seq += j.base
		j.max = e.Seq
		if e.Rec != 0 {
			e.Rec += j.recBase
			j.recMax = max(j.recMax, e.Rec)
		}
		j.buf.Add(e)
	}
}

func (j *jrnl) feed(b []byte) {
	if j == nil {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if !j.on {
		return
	}
	j.last = time.Now()
	j.add(j.p.Feed(b))
}

// start runs the quiet-flush ticker until stop.
func (j *jrnl) start() {
	if j == nil {
		return
	}
	go func() {
		t := time.NewTicker(journalQuiet)
		defer t.Stop()
		for {
			select {
			case <-j.done:
				return
			case now := <-t.C:
				j.mu.Lock()
				if j.on && now.Sub(j.last) >= journalQuiet {
					j.add(j.p.Flush(now))
				}
				j.mu.Unlock()
			}
		}
	}()
}

func (j *jrnl) stop() {
	if j != nil {
		j.once.Do(func() { close(j.done) })
	}
}

// control applies a client control payload (reply may be nil); unknown or invalid ones are ignored.
func (j *jrnl) control(p []byte, reply func([]byte) error) {
	if j == nil {
		return
	}
	var v struct {
		Type string `json:"type"`
		Seq  uint64 `json:"seq"`
		On   *bool  `json:"on"`
	}
	if json.Unmarshal(p, &v) != nil {
		return
	}
	switch v.Type {
	case "jrnl-ack":
		j.mu.Lock()
		seq := min(v.Seq, j.sent) // a bogus ack must not free unsent events
		j.mu.Unlock()
		j.buf.Ack(seq)
	case "jrnl-forget":
		j.buf.Wipe()
		// The socket is ordered: the client drops journal frames until this
		// arrives, so none sent before the wipe can re-add rows afterwards.
		if reply != nil {
			_ = reply(frame.Encode(frame.Control, []byte(`{"type":"jrnl-forgotten"}`)))
		}
	case "jrnl-record":
		if v.On == nil {
			return
		}
		j.mu.Lock()
		defer j.mu.Unlock()
		switch {
		case !*v.On && j.on:
			j.on = false
			j.buf.Wipe()
		case *v.On && !j.on:
			j.on, j.base, j.recBase, j.p = true, j.max, j.recMax, journal.NewParser(time.Now)
		}
	}
}

// stream sends pending events as Journal frames each tick until ctx ends or a
// write fails.
func (j *jrnl) stream(ctx context.Context, write func([]byte) error) {
	if j == nil {
		return
	}
	var sent uint64
	t := time.NewTicker(journalTick)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		evs := j.buf.Since(sent)
		if len(evs) == 0 {
			continue
		}
		if write(frame.EncodeJournal(evs)) != nil {
			return
		}
		sent = evs[len(evs)-1].Seq
		j.mu.Lock()
		j.sent = max(j.sent, sent)
		j.mu.Unlock()
	}
}
