package term

// ring is a fixed-capacity byte ring keeping the newest bytes written.
type ring struct {
	buf  []byte
	pos  int  // next write index
	full bool // buf has wrapped
}

func newRing(n int) *ring { return &ring{buf: make([]byte, n)} }

func (g *ring) write(p []byte) {
	if len(p) >= len(g.buf) {
		copy(g.buf, p[len(p)-len(g.buf):])
		g.pos, g.full = 0, true
		return
	}
	n := copy(g.buf[g.pos:], p)
	if n < len(p) {
		copy(g.buf, p[n:])
		g.full = true
	}
	g.pos = (g.pos + len(p)) % len(g.buf)
	if g.pos == 0 {
		g.full = true
	}
}

// snapshot returns a copy of the buffered bytes, oldest first.
func (g *ring) snapshot() []byte {
	if !g.full {
		return append([]byte(nil), g.buf[:g.pos]...)
	}
	out := make([]byte, 0, len(g.buf))
	out = append(out, g.buf[g.pos:]...)
	return append(out, g.buf[:g.pos]...)
}
