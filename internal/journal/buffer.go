package journal

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"sync"
)

// chunk is one sealed event (nonce||ciphertext) with its seq in the clear so
// Ack and Since can skip chunks without decrypting.
type chunk struct {
	seq  uint64
	data []byte
}

// Buffer holds unacknowledged events AES-256-GCM encrypted under a random
// in-memory key, capped at capBytes of sealed data. Safe for concurrent use.
type Buffer struct {
	mu     sync.Mutex
	cap    int
	key    []byte
	aead   cipher.AEAD
	chunks []chunk
	gap    *chunk // single front gap marker for dropped events, or nil
	size   int    // sealed bytes of chunks plus gap
}

// NewBuffer returns a buffer capped at capBytes of sealed data.
func NewBuffer(capBytes int) *Buffer {
	b := &Buffer{cap: capBytes}
	b.rekey()
	return b
}

func (b *Buffer) rekey() {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		panic(err) // crypto/rand failure is unrecoverable
	}
	blk, _ := aes.NewCipher(k)
	b.aead, _ = cipher.NewGCM(blk)
	b.key = k
}

func (b *Buffer) seal(ev Event) (chunk, bool) {
	pt, err := json.Marshal(ev)
	if err != nil {
		return chunk{}, false
	}
	n := b.aead.NonceSize()
	out := make([]byte, n, n+len(pt)+b.aead.Overhead())
	if _, err := rand.Read(out); err != nil {
		panic(err)
	}
	return chunk{seq: ev.Seq, data: b.aead.Seal(out, out, pt, nil)}, true
}

func (b *Buffer) open(c chunk) (Event, bool) {
	var ev Event
	n := b.aead.NonceSize()
	if len(c.data) < n {
		return ev, false
	}
	pt, err := b.aead.Open(nil, c.data[:n], c.data[n:], nil)
	if err != nil || json.Unmarshal(pt, &ev) != nil {
		return ev, false
	}
	return ev, true
}

// Add seals ev. Over the cap it drops the oldest events and keeps a single
// front gap event carrying the newest dropped seq.
func (b *Buffer) Add(ev Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.aead == nil { // wiped: re-key lazily
		b.rekey()
	}
	c, ok := b.seal(ev)
	if !ok {
		return
	}
	b.chunks = append(b.chunks, c)
	b.size += len(c.data)
	for b.size > b.cap && len(b.chunks) > 0 {
		old := b.chunks[0]
		b.chunks[0] = chunk{}
		b.chunks = b.chunks[1:]
		b.size -= len(old.data)
		d, ok := b.open(old)
		if !ok {
			d = Event{Seq: old.seq}
		}
		if b.gap != nil {
			b.size -= len(b.gap.data)
			b.gap = nil
		}
		if g, ok := b.seal(Event{Seq: d.Seq, Kind: KindGap, Rec: d.Rec, Why: "buffer full", At: d.At}); ok {
			b.gap = &g
			b.size += len(g.data)
		}
	}
}

// Since returns decrypted events with Seq > seq, oldest first. Chunks that
// fail to open are skipped.
func (b *Buffer) Since(seq uint64) []Event {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []Event
	if b.aead == nil {
		return out
	}
	all := b.chunks
	if b.gap != nil {
		all = append([]chunk{*b.gap}, all...)
	}
	for _, c := range all {
		if c.seq <= seq {
			continue
		}
		if ev, ok := b.open(c); ok {
			out = append(out, ev)
		}
	}
	return out
}

// Ack frees every event with Seq <= seq.
func (b *Buffer) Ack(seq uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.gap != nil && b.gap.seq <= seq {
		b.size -= len(b.gap.data)
		b.gap = nil
	}
	i := 0
	for i < len(b.chunks) && b.chunks[i].seq <= seq {
		b.size -= len(b.chunks[i].data)
		b.chunks[i] = chunk{}
		i++
	}
	b.chunks = b.chunks[i:]
}

// Wipe zeroes the key and drops everything. A later Add re-keys lazily.
func (b *Buffer) Wipe() {
	b.mu.Lock()
	defer b.mu.Unlock()
	clear(b.key)
	b.key, b.aead = nil, nil
	b.chunks, b.gap, b.size = nil, nil, 0
}
