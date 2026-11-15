// Package journal turns a raw PTY byte stream into ordered journal events
// (command start, output, end, gap) using OSC 133 shell-integration marks.
package journal

import (
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	KindStart = "start"
	KindOut   = "out"
	KindEnd   = "end"
	KindGap   = "gap"
)

const (
	maxOut     = 64 << 10 // max Text bytes per out event
	maxSeq     = 4 << 10  // max pending escape sequence
	maxCmd     = 8 << 10  // max command line kept
	sliceGap   = 2 * time.Second
	fullScreen = "[full-screen app]\n"
)

// Event is one journal entry.
type Event struct {
	Seq  uint64    `json:"seq"`
	Kind string    `json:"kind"` // "start" | "out" | "end" | "gap"
	Rec  uint64    `json:"rec"`  // record id the event belongs to
	Cmd  string    `json:"cmd,omitempty"`
	Cwd  string    `json:"cwd,omitempty"`
	Text string    `json:"text,omitempty"` // out: ANSI-stripped UTF-8
	Exit *int      `json:"exit,omitempty"`
	Why  string    `json:"why,omitempty"` // gap reason
	At   time.Time `json:"at"`
}

type phase uint8

const (
	phIdle   phase = iota // after D
	phPrompt              // A..B
	phCmd                 // B..C
	phOut                 // C..D
)

// Parser is an incremental OSC 133 parser. Not safe for concurrent use.
type Parser struct {
	now      func() time.Time
	seqN     uint64 // last seq issued
	recN     uint64 // last rec id issued
	rec      uint64 // open record, 0 if none
	markers  bool
	atPrompt bool
	phase    phase
	state    state
	buf      []byte // pending escape sequence body
	out      []byte // unflushed output text
	cmd      []byte // command line between B and C
	cr       bool   // pending carriage return
	alt      bool   // inside full-screen app
	cwd      string
	at       time.Time // clock reading for the current Feed
	last     time.Time // last output time (no-marker slicing)
	evs      []Event
}

func NewParser(now func() time.Time) *Parser {
	return &Parser{now: now}
}

func (p *Parser) AtPrompt() bool   { return p.atPrompt }
func (p *Parser) HasMarkers() bool { return p.markers }

// Gap returns a gap event with a fresh seq and rec.
func (p *Parser) Gap(why string) Event {
	p.recN++
	p.seqN++
	return Event{Seq: p.seqN, Kind: KindGap, Rec: p.recN, Why: why, At: p.now()}
}

// Feed consumes PTY bytes and returns the events they completed.
func (p *Parser) Feed(b []byte) []Event {
	if len(b) == 0 {
		return nil
	}
	p.at = p.now()
	if !p.markers && p.rec != 0 && p.at.Sub(p.last) >= sliceGap {
		p.closeRec(nil)
	}
	for _, c := range b {
		p.step(c)
	}
	p.flush(false)
	evs := p.evs
	p.evs = nil
	return evs
}

func (p *Parser) emit(e Event) Event {
	p.seqN++
	e.Seq = p.seqN
	e.At = p.at
	p.evs = append(p.evs, e)
	return e
}

func (p *Parser) openRec(cmd, cwd string) {
	p.closeRec(nil)
	p.recN++
	p.rec = p.recN
	p.emit(Event{Kind: KindStart, Rec: p.rec, Cmd: cmd, Cwd: cwd})
}

func (p *Parser) closeRec(exit *int) {
	p.flush(true)
	p.cr, p.alt = false, false
	if p.rec == 0 {
		return
	}
	p.emit(Event{Kind: KindEnd, Rec: p.rec, Exit: exit})
	p.rec = 0
}

// active reports whether text should be journaled now, opening a time slice
// record when no markers have been seen.
func (p *Parser) active() bool {
	if !p.markers {
		if p.rec == 0 {
			p.openRec("", "")
		}
		p.last = p.at
		return true
	}
	return p.phase == phOut && p.rec != 0
}

// flush emits buffered output; unless final, a trailing partial rune is kept.
func (p *Parser) flush(final bool) {
	cut := len(p.out)
	if !final {
		cut = completeLen(p.out)
	}
	if cut == 0 || p.rec == 0 {
		if p.rec == 0 {
			p.out = p.out[:0]
		}
		return
	}
	s := strings.ToValidUTF8(string(p.out[:cut]), "�")
	p.out = append(p.out[:0], p.out[cut:]...)
	for len(s) > 0 {
		n := len(s)
		if n > maxOut {
			n = maxOut
			for n > 0 && !utf8.RuneStart(s[n]) {
				n--
			}
			if n == 0 { // cannot happen with valid UTF-8; stay safe
				n = maxOut
			}
		}
		p.emit(Event{Kind: KindOut, Rec: p.rec, Text: s[:n]})
		s = s[n:]
	}
}

// completeLen returns len(b) minus any trailing incomplete UTF-8 sequence.
func completeLen(b []byte) int {
	for i := len(b) - 1; i >= 0 && i >= len(b)-3; i-- {
		if utf8.RuneStart(b[i]) {
			if utf8.FullRune(b[i:]) {
				return len(b)
			}
			return i
		}
	}
	return len(b)
}

func (p *Parser) mark(f []string) {
	if len(f) == 0 || f[0] == "" {
		return
	}
	switch f[0][0] {
	case 'A':
		p.markers = true
		p.closeRec(nil)
		p.phase, p.atPrompt = phPrompt, true
	case 'B':
		p.markers = true
		p.closeRec(nil)
		p.phase, p.atPrompt = phCmd, false
		p.cmd = p.cmd[:0]
	case 'C':
		p.markers = true
		cmd := ""
		if p.phase == phCmd {
			cmd = strings.TrimSpace(strings.ToValidUTF8(string(p.cmd), "�"))
		}
		p.openRec(cmd, p.cwd)
		p.phase, p.atPrompt = phOut, false
	case 'D':
		p.markers = true
		var exit *int
		if len(f) > 1 {
			if n, err := strconv.Atoi(f[1]); err == nil {
				exit = &n
			}
		}
		p.closeRec(exit)
		p.phase, p.atPrompt = phIdle, true
	}
}

func (p *Parser) setCwd(raw string) {
	if u, err := url.Parse(raw); err == nil && u.Path != "" {
		p.cwd = u.Path
	}
}
