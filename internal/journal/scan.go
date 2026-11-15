package journal

import "strings"

type state uint8

const (
	stGround state = iota
	stEsc
	stCSI
	stOSC
	stOSCEsc
	stStr // DCS / APC / PM / SOS: swallowed
	stStrEsc
	stSS3 // ESC O: swallow one byte
)

// step advances the byte-level state machine (ground / ESC / CSI / OSC).
func (p *Parser) step(c byte) {
	switch p.state {
	case stGround:
		if c == 0x1b {
			p.begin(stEsc)
			return
		}
		p.text(c)
	case stEsc:
		switch {
		case c == 0x1b:
			p.begin(stEsc)
		case c == 'O':
			p.begin(stSS3)
		case c == '[':
			p.begin(stCSI)
		case c == ']':
			p.begin(stOSC)
		case c == 'P' || c == '_' || c == '^' || c == 'X':
			p.begin(stStr)
		case c >= 0x20 && c <= 0x2f: // intermediate, e.g. ESC ( B
			p.collect(c)
		default:
			p.reset()
		}
	case stSS3:
		p.reset()
	case stCSI:
		if c == 0x1b {
			p.begin(stEsc)
		} else if c == 0x18 || c == 0x1a {
			p.reset()
		} else if c >= 0x40 && c <= 0x7e {
			p.csi(c)
			p.reset()
		} else {
			p.collect(c)
		}
	case stOSC:
		switch c {
		case 0x07:
			p.osc()
			p.reset()
		case 0x1b:
			p.state = stOSCEsc
		default:
			p.collect(c)
		}
	case stStr:
		switch c {
		case 0x07:
			p.reset()
		case 0x1b:
			p.state = stStrEsc
		default:
			p.collect(c)
		}
	case stOSCEsc, stStrEsc:
		if c == '\\' {
			if p.state == stOSCEsc {
				p.osc()
			}
			p.reset()
			return
		}
		p.begin(stEsc) // aborted; c starts a fresh escape
		p.step(c)
	}
}

func (p *Parser) begin(s state) { p.state = s; p.buf = p.buf[:0]; p.ovf = false }
func (p *Parser) reset()        { p.begin(stGround) }

// collect keeps a pending sequence byte; past maxSeq the sequence is marked
// overflowed and swallowed to its terminator without being stored.
func (p *Parser) collect(c byte) {
	if len(p.buf) >= maxSeq {
		p.ovf = true
		return
	}
	p.buf = append(p.buf, c)
}

func (p *Parser) osc() {
	if p.ovf {
		return
	}
	s := string(p.buf)
	switch {
	case strings.HasPrefix(s, "133;"):
		p.mark(strings.Split(s[4:], ";"))
	case strings.HasPrefix(s, "7;"):
		p.setCwd(s[2:])
	}
}

// csi detects full-screen (alternate screen) enter/leave.
func (p *Parser) csi(final byte) {
	if p.ovf || (final != 'h' && final != 'l') || len(p.buf) == 0 || p.buf[0] != '?' {
		return
	}
	for _, m := range strings.Split(string(p.buf[1:]), ";") {
		if m == "1049" || m == "1047" || m == "47" {
			p.setAlt(final == 'h')
		}
	}
}

func (p *Parser) setAlt(on bool) {
	if on == p.alt {
		return
	}
	if on && p.active() {
		p.flush(flFinal)
		txt := fullScreen
		if p.lineOpen {
			txt = "\n" + txt
		}
		p.emit(Event{Kind: KindOut, Rec: p.cur, Text: txt})
		p.lineOpen = false
	}
	p.alt = on
}

// text handles one printable/control byte outside escape sequences.
func (p *Parser) text(c byte) {
	if p.alt {
		return
	}
	if p.markers && p.phase == phCmd {
		if (c >= 0x20 && c != 0x7f || c == '\t' || c == '\n') && len(p.cmd) < maxCmd {
			p.cmd = append(p.cmd, c)
		}
		return
	}
	if c != '\r' && c != '\n' && c != '\t' && (c < 0x20 || c == 0x7f) {
		return
	}
	if !p.active() {
		return
	}
	if c == '\r' { // consecutive CRs keep the pending state
		p.cr = true
		return
	}
	if p.cr {
		p.cr = false
		if c != '\n' { // lone CR: keep only text after it on this line
			p.out = p.out[:p.ls]
			p.lineOpen = false
		}
	}
	p.out = append(p.out, c)
	if c == '\n' {
		p.ls, p.lineOpen = len(p.out), false
	} else {
		p.lineOpen = true
	}
}
