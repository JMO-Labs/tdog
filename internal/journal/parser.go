// Package journal turns a raw PTY byte stream into ordered journal events
// (command start, output, end, gap) using OSC 133 shell-integration marks.
package journal

import (
	"bytes"
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
	cur      uint64 // record receiving out events (stays set after D)
	ls       int    // start of current line in out
	lineOpen bool   // current output line is non-empty
	ovf      bool   // pending sequence exceeded maxSeq
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

// Gap closes any open record (flushing its output), resets the scanner and
// returns the closing events followed by a gap event with a fresh seq and rec.
func (p *Parser) Gap(why string) []Event {
	p.at = p.now()
	p.endRec(nil)
	p.reset()
	p.phase, p.atPrompt = phIdle, false
	p.cmd = p.cmd[:0]
	p.recN++
	p.emit(Event{Kind: KindGap, Rec: p.recN, Why: why})
	return p.take()
}

// Out returns a standalone out event with a fresh seq and no record (Rec 0;
// the caller sets it). Parser state is untouched.
func (p *Parser) Out(text string) []Event {
	p.at = p.now()
	p.emit(Event{Kind: KindOut, Text: text})
	return p.take()
}

// Feed consumes PTY bytes and returns the events they completed. The partial
// last line of output is held back until a newline or Flush.
func (p *Parser) Feed(b []byte) []Event {
	if len(b) == 0 {
		return nil
	}
	p.at = p.now()
	if !p.markers && p.rec != 0 && p.at.Sub(p.last) >= sliceGap {
		p.endRec(nil)
	}
	for _, c := range b {
		p.step(c)
	}
	p.flush(flLines)
	return p.take()
}

// Flush emits the held-back partial line (it is final once flushed) and, with
// no markers seen, ends the open record after sliceGap without output.
func (p *Parser) Flush(now time.Time) []Event {
	p.at = now
	p.flush(flTail)
	if !p.markers && p.rec != 0 && now.Sub(p.last) >= sliceGap {
		p.endRec(nil)
	}
	return p.take()
}

func (p *Parser) take() []Event {
	evs := p.evs
	p.evs = nil
	return evs
}

func (p *Parser) emit(e Event) {
	p.seqN++
	e.Seq = p.seqN
	e.At = p.at
	p.evs = append(p.evs, e)
}

func (p *Parser) openRec(cmd, cwd string) {
	p.endRec(nil)
	p.recN++
	p.rec, p.cur, p.lineOpen = p.recN, p.recN, false
	p.emit(Event{Kind: KindStart, Rec: p.rec, Cmd: cmd, Cwd: cwd})
}

// closeRec ends the open record; output may still follow it (after D).
func (p *Parser) closeRec(exit *int) {
	p.flush(flFinal)
	p.cr, p.alt = false, false
	if p.rec == 0 {
		return
	}
	p.emit(Event{Kind: KindEnd, Rec: p.rec, Exit: exit})
	p.rec = 0
}

// endRec closes the record and detaches output from it.
func (p *Parser) endRec(exit *int) {
	p.closeRec(exit)
	p.cur = 0
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
	if p.phase == phIdle {
		return p.cur != 0 // output after D joins the record that just ended
	}
	return p.phase == phOut && p.rec != 0
}

const (
	flLines = iota // complete lines only (plus a tail past the cap)
	flTail         // everything but an incomplete rune
	flFinal        // everything
)

func (p *Parser) flush(mode int) {
	cut := len(p.out)
	switch mode {
	case flTail:
		cut = completeLen(p.out)
	case flLines:
		cut = bytes.LastIndexByte(p.out, '\n') + 1
		if len(p.out)-cut >= maxOut {
			cut = completeLen(p.out)
		}
	}
	if cut == 0 {
		return
	}
	s := strings.ToValidUTF8(string(p.out[:cut]), "\uFFFD")
	p.out = append(p.out[:0], p.out[cut:]...)
	p.ls = 0
	if p.cur == 0 {
		return
	}
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
		p.emit(Event{Kind: KindOut, Rec: p.cur, Text: s[:n]})
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
	if len(f) == 0 {
		return
	}
	switch f[0] {
	case "A":
		p.markers = true
		p.endRec(nil)
		p.phase, p.atPrompt = phPrompt, true
	case "B":
		p.markers = true
		p.endRec(nil)
		p.phase, p.atPrompt = phCmd, false
		p.cmd = p.cmd[:0]
	case "C":
		p.markers = true
		cmd := ""
		if p.phase == phCmd {
			cmd = strings.TrimSpace(strings.ToValidUTF8(string(p.cmd), "\uFFFD"))
		}
		p.openRec(cmd, p.cwd)
		p.phase, p.atPrompt = phOut, false
	case "D":
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
