package journal

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"sync"
	"time"
)

// chunk is one sealed event (nonce||ct) with seq, rec and at in the clear so
// Ack, Since and overflow never decrypt just to skip or summarise a chunk.
// seq is also bound to the ciphertext as AAD.
type chunk struct {
	seq, rec uint64
	at       time.Time
	data     []byte // immutable once sealed
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

func aad(seq uint64) []byte { return binary.BigEndian.AppendUint64(nil, seq) }

// seal must be called with b.mu held and b.aead set.
func (b *Buffer) seal(ev Event) chunk {
	// ponytail: Marshal of Event and Seal with a valid key cannot fail.
	pt, _ := json.Marshal(ev)
	n := b.aead.NonceSize()
	out := make([]byte, n, n+len(pt)+b.aead.Overhead())
	if _, err := rand.Read(out); err != nil {
		panic(err)
	}
	return chunk{ev.Seq, ev.Rec, ev.At, b.aead.Seal(out, out, pt, aad(ev.Seq))}
}

func open(a cipher.AEAD, c chunk) (Event, bool) {
	var ev Event
	n := a.NonceSize()
	if len(c.data) < n {
		return ev, false
	}
	pt, err := a.Open(nil, c.data[:n], c.data[n:], aad(c.seq))
	if err != nil || json.Unmarshal(pt, &ev) != nil {
		return ev, false
	}
	return ev, true
}

// Add seals ev. Over the cap it drops the oldest events and keeps a single
// front gap event carrying the newest dropped seq/rec/at.
func (b *Buffer) Add(ev Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.aead == nil { // wiped: re-key lazily
		b.rekey()
	}
	c := b.seal(ev)
	b.chunks = append(b.chunks, c)
	b.size += len(c.data)
	if b.size <= b.cap {
		return
	}
	var last chunk
	if b.gap != nil {
		last = *b.gap
		b.size -= len(b.gap.data)
		b.gap = nil
	}
	est := 0
	for {
		for len(b.chunks) > 0 && b.size+est > b.cap {
			last = b.chunks[0]
			b.chunks[0] = chunk{}
			b.chunks = b.chunks[1:]
			b.size -= len(last.data)
		}
		g := b.seal(Event{Seq: last.seq, Kind: KindGap, Rec: last.rec, Why: "buffer full", At: last.at})
		est = len(g.data)
		if b.size+est <= b.cap || len(b.chunks) == 0 {
			b.gap = &g
			b.size += est
			return
		}
	}
}

// Since returns decrypted events with Seq > seq, oldest first. Chunks that
// fail to open are skipped. Decryption happens outside the lock.
func (b *Buffer) Since(seq uint64) []Event {
	b.mu.Lock()
	a := b.aead
	var all []chunk
	if b.gap != nil && b.gap.seq > seq {
		all = append(all, *b.gap)
	}
	for _, c := range b.chunks {
		if c.seq > seq {
			all = append(all, c)
		}
	}
	b.mu.Unlock()
	var out []Event
	if a == nil {
		return out
	}
	for _, c := range all {
		if ev, ok := open(a, c); ok {
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
