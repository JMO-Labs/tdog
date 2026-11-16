package term

import (
	"context"
	"encoding/json"
	"log"
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

	// Optional server sync (nil store = off). pane returns "" when the session
	// has no valid pane id; such sessions never sync.
	store   *journal.Store
	sid     string
	pane    func() string
	prevAck uint64 // highest seq already appended to the store; guarded by mu

	beforeAppend      func() // test seam: runs in ack just before Append
	afterForgetDelete func() // test seam: runs in forget between delete and reopen

	streamMu   sync.Mutex // serializes stream's Since+write with forget's wipe+reply
	afterSince func()     // test seam: runs in stream between Since and write

	// Restore from host (restore.go); guarded by mu.
	tail    []string             // last anchorLines complete non-empty output lines
	partial string               // output after the last newline
	parks   map[uint64]*parkInfo // disconnected gap rec -> how to restore it
	parkGen uint64               // bumped whenever parks are dropped
}

func newJrnl() *jrnl {
	return &jrnl{buf: journal.NewBuffer(journalCap), p: journal.NewParser(time.Now), on: true, done: make(chan struct{})}
}

// add stores events; callers hold j.mu.
func (j *jrnl) add(evs []journal.Event) {
	for _, e := range evs {
		if e.Kind == journal.KindOut {
			j.track(e.Text)
		}
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
		j.dropParks()
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
		Rec  uint64 `json:"rec"`
		On   *bool  `json:"on"`
	}
	if json.Unmarshal(p, &v) != nil {
		return
	}
	switch v.Type {
	case "jrnl-ack":
		j.ack(v.Seq)
	case "jrnl-forget":
		j.streamMu.Lock()
		defer j.streamMu.Unlock()
		j.buf.Wipe()
		j.dropParks() // a restore must not bring forgotten text back
		defer j.forgetSynced()()
		// The socket is ordered: the client drops journal frames until this
		// arrives, so none sent before the wipe can re-add rows afterwards.
		if reply != nil {
			_ = reply(frame.Encode(frame.Control, []byte(`{"type":"jrnl-forgotten"}`)))
		}
	case "jrnl-restore":
		if v.Rec != 0 {
			go j.restore(v.Rec, reply) // scans up to 50k lines; keep input responsive
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
			j.dropParksLocked()
		case *v.On && !j.on:
			j.on, j.base, j.recBase, j.p = true, j.max, j.recMax, journal.NewParser(time.Now)
		}
	}
}

// kill drops the synced files for good: the store refuses this session's
// appends from now on, so a racing ack cannot recreate them.
func (j *jrnl) kill() {
	if j == nil {
		return
	}
	j.dropParks()
	if p := j.syncPane(); p != "" {
		if err := j.store.KillPane(p, j.sid); err != nil {
			log.Printf("journal: delete %s: %v", p, err)
		}
	} else if j.store != nil {
		j.store.KillSid(j.sid) // a pane set later must never sync
	}
}

// forgetSynced deletes the pane's synced files; acks are refused until the
// returned func reopens it (a kill that lands meanwhile stays final).
func (j *jrnl) forgetSynced() (reopen func()) {
	p := j.syncPane()
	if p == "" {
		return func() {}
	}
	if err := j.store.DeletePane(p); err != nil {
		log.Printf("journal: forget %s: %v", p, err)
	}
	if j.afterForgetDelete != nil {
		j.afterForgetDelete()
	}
	return func() { j.store.Reopen(p) }
}

// syncPane is the pane to sync under, or "" when sync is off or unavailable.
func (j *jrnl) syncPane() string {
	if j.store == nil || j.pane == nil {
		return ""
	}
	return j.pane()
}

// ack frees events up to seq (clamped to what was sent). With sync on, the
// newly acked events are appended to the store first, outside j.mu so a slow
// disk never stalls feed; the store serializes that against kill/forget. A
// store error is logged and the ack still goes through, so the browser copy
// stays authoritative.
func (j *jrnl) ack(want uint64) {
	j.mu.Lock()
	seq := min(want, j.sent) // a bogus ack must not free unsent events
	prev := j.prevAck
	j.prevAck = max(prev, seq)
	var evs []journal.Event
	var gen uint64
	p := j.syncPane()
	if p != "" && seq > prev && j.store.Enabled() {
		gen = j.store.Gen(p) // a delete after this makes the append a no-op
		for _, e := range j.buf.Since(prev) {
			if e.Seq <= seq {
				evs = append(evs, e)
			}
		}
	}
	j.mu.Unlock()
	if len(evs) > 0 {
		if j.beforeAppend != nil {
			j.beforeAppend()
		}
		if err := j.store.AppendAt(p, j.sid, evs, gen); err != nil {
			log.Printf("journal: sync %s: %v", p, err)
		}
	}
	j.buf.Ack(seq)
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
		if !j.flush(&sent, write) {
			return
		}
	}
}

// flush sends one batch. Since+write+sent update hold streamMu so a forget's
// wipe+reply cannot fall between them: a batch read before the wipe is written
// before jrnl-forgotten, where the client still drops it. A wipe keeps seqs
// monotonic (the parser is not reset), so the local sent stays valid. Returns
// false when the write failed.
func (j *jrnl) flush(sent *uint64, write func([]byte) error) bool {
	j.streamMu.Lock()
	defer j.streamMu.Unlock()
	evs := j.buf.Since(*sent)
	if j.afterSince != nil {
		j.afterSince()
	}
	if len(evs) == 0 {
		return true
	}
	// Record sent before writing: the client may ack as soon as the frame
	// lands, and an ack racing this update would be clamped away. A failed
	// write only overstates sent for a dead stream; the clamp is for bogus acks.
	last := evs[len(evs)-1].Seq
	j.mu.Lock()
	j.sent = max(j.sent, last)
	j.mu.Unlock()
	if write(frame.EncodeJournal(evs)) != nil {
		return false
	}
	*sent = last
	return true
}
