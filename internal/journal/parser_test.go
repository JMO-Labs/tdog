package journal

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newTest() (*Parser, *clock) {
	c := &clock{t: time.Unix(1000, 0)}
	return NewParser(c.now), c
}

// summarize merges consecutive out events of one rec and renders events as strings.
func summarize(evs []Event) []string {
	var res []string
	for _, e := range evs {
		switch e.Kind {
		case KindStart:
			s := "start:" + e.Cmd
			if e.Cwd != "" {
				s += "@" + e.Cwd
			}
			res = append(res, s)
		case KindOut:
			if n := len(res); n > 0 && strings.HasPrefix(res[n-1], "out:") {
				res[n-1] += e.Text
			} else {
				res = append(res, "out:"+e.Text)
			}
		case KindEnd:
			if e.Exit == nil {
				res = append(res, "end:-")
			} else {
				res = append(res, fmt.Sprintf("end:%d", *e.Exit))
			}
		case KindGap:
			res = append(res, "gap:"+e.Why)
		}
	}
	return res
}

func feedAll(p *Parser, in string, split bool) []Event {
	if !split {
		return p.Feed([]byte(in))
	}
	var evs []Event
	for i := 0; i < len(in); i++ {
		evs = append(evs, p.Feed([]byte{in[i]})...)
	}
	return evs
}

func TestParser(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    []string
		prompt  bool
		noSplit bool
		markers bool
	}{
		{"marked command",
			"\x1b]133;A\x07$ \x1b]133;B\x07ls\r\n\x1b]133;C\x07a\r\nb\r\n\x1b]133;D;0\x07",
			[]string{"start:ls", "out:a\nb\n", "end:0"}, true, false, true},
		{"ansi stripped",
			"\x1b]133;C\x07\x1b[32mok\x1b[0m\x1b]133;D;0\x07",
			[]string{"start:", "out:ok", "end:0"}, true, false, true},
		{"cwd from osc 7",
			"\x1b]7;file://h/srv/app\x1b\\\x1b]133;B\x07ls\x1b]133;C\x07",
			[]string{"start:ls@/srv/app"}, false, false, true},
		{"nonzero exit and missing exit",
			"\x1b]133;C\x07x\n\x1b]133;D;130\x07\x1b]133;C\x07y\n\x1b]133;D\x07",
			[]string{"start:", "out:x\n", "end:130", "start:", "out:y\n", "end:-"}, true, false, true},
		{"prompt text not journaled",
			"\x1b]133;A\x07user@h$ \x1b]133;B\x07",
			nil, false, false, true},
		{"interrupted command ends at next prompt",
			"\x1b]133;C\x07a\n\x1b]133;A\x07",
			[]string{"start:", "out:a\n", "end:-"}, true, false, true},
		{"cr progress bar",
			"\x1b]133;C\x0710%\r50%\r100%\r\nok\r\n\x1b]133;D;0\x07",
			[]string{"start:", "out:100%\nok\n", "end:0"}, true, true, true},
		{"utf8 intact",
			"\x1b]133;C\x07h\xc3\xa9llo \xe2\x9c\x93\n\x1b]133;D;0\x07",
			[]string{"start:", "out:héllo ✓\n", "end:0"}, true, false, true},
	}
	for _, tc := range tests {
		for _, split := range []bool{false, true} {
			if split && tc.noSplit {
				continue
			}
			t.Run(fmt.Sprintf("%s/split=%v", tc.name, split), func(t *testing.T) {
				p, _ := newTest()
				got := summarize(feedAll(p, tc.in, split))
				if strings.Join(got, "|") != strings.Join(tc.want, "|") {
					t.Fatalf("got %q want %q", got, tc.want)
				}
				if p.AtPrompt() != tc.prompt {
					t.Fatalf("AtPrompt=%v want %v", p.AtPrompt(), tc.prompt)
				}
				if p.HasMarkers() != tc.markers {
					t.Fatalf("HasMarkers=%v want %v", p.HasMarkers(), tc.markers)
				}
			})
		}
	}
}

func TestFullScreenApp(t *testing.T) {
	p, _ := newTest()
	evs := p.Feed([]byte("\x1b]133;C\x07\x1b[?1049hjunk\x1b[2J\x1b[H more\x1b[?1049l\x1b]133;D;0\x07"))
	var outs []string
	for _, e := range evs {
		if e.Kind == KindOut {
			outs = append(outs, e.Text)
		}
	}
	if len(outs) != 1 || outs[0] != "[full-screen app]\n" {
		t.Fatalf("outs=%q", outs)
	}
}

func TestNoMarkersTimeSlicing(t *testing.T) {
	p, c := newTest()
	evs := p.Feed([]byte("x"))
	c.t = c.t.Add(3 * time.Second)
	evs = append(evs, p.Feed([]byte("y"))...)
	if p.HasMarkers() {
		t.Fatal("HasMarkers should be false")
	}
	if got := strings.Join(summarize(evs), "|"); got != "start:|out:x|end:-|start:|out:y" {
		t.Fatalf("got %s", got)
	}
	if evs[0].Rec == evs[3].Rec {
		t.Fatal("expected two distinct recs")
	}
	for i, e := range evs {
		if e.Seq != uint64(i+1) {
			t.Fatalf("seq[%d]=%d", i, e.Seq)
		}
	}
	// within 2s: same record
	p, c = newTest()
	p.Feed([]byte("x"))
	c.t = c.t.Add(time.Second)
	if evs := p.Feed([]byte("y")); len(evs) != 1 || evs[0].Kind != KindOut {
		t.Fatalf("got %v", evs)
	}
}

func TestMarkersEndSlice(t *testing.T) {
	p, _ := newTest()
	evs := p.Feed([]byte("boot\n\x1b]133;A\x07"))
	if got := strings.Join(summarize(evs), "|"); got != "start:|out:boot\n|end:-" {
		t.Fatalf("got %s", got)
	}
}

func TestGap(t *testing.T) {
	p, _ := newTest()
	evs := p.Feed([]byte("\x1b]133;C\x07a\n\x1b]133;D;0\x07"))
	last := evs[len(evs)-1]
	g := p.Gap("parked")
	if g.Kind != KindGap || g.Why != "parked" || g.Seq <= last.Seq || g.Rec == 0 || g.Rec == last.Rec {
		t.Fatalf("gap=%+v last=%+v", g, last)
	}
	next := p.Feed([]byte("\x1b]133;C\x07"))
	if next[0].Seq <= g.Seq || next[0].Rec == g.Rec {
		t.Fatalf("next=%+v gap=%+v", next[0], g)
	}
}

func TestOutCap(t *testing.T) {
	p, _ := newTest()
	p.Feed([]byte("\x1b]133;C\x07"))
	evs := p.Feed([]byte(strings.Repeat("a", 200000)))
	total := 0
	for _, e := range evs {
		if len(e.Text) > maxOut {
			t.Fatalf("out %d > cap", len(e.Text))
		}
		total += len(e.Text)
	}
	if len(evs) < 4 || total != 200000 {
		t.Fatalf("events=%d total=%d", len(evs), total)
	}
}

func TestUnterminatedSequencesBounded(t *testing.T) {
	for _, intro := range []string{"\x1b]0;", "\x1b[1;", "\x1bP", "\x1b("} {
		p, _ := newTest()
		p.Feed([]byte("\x1b]133;C\x07"))
		junk := strings.Repeat("9", 100000)
		for i := 0; i < len(junk); i += 1000 {
			p.Feed([]byte(intro + junk[i:i+1000]))
			if len(p.buf) > maxSeq {
				t.Fatalf("%q: buf %d > %d", intro, len(p.buf), maxSeq)
			}
		}
	}
	// after a discard, parser is usable again
	p, _ := newTest()
	p.Feed([]byte("\x1b]133;C\x07\x1b]0;" + strings.Repeat("z", 10000)))
	if p.state != stGround {
		t.Fatal("expected ground state after overflow")
	}
	p.Feed([]byte("\x1b]133;D;0\x07"))
	if !p.AtPrompt() {
		t.Fatal("marker after overflow not parsed")
	}
}

func TestInvalidUTF8(t *testing.T) {
	p, _ := newTest()
	evs := p.Feed([]byte("\x1b]133;B\x07\xff\xfe\x1b]133;C\x07\xff\xfe\xc3(\xe2\x82"))
	evs = append(evs, p.Feed([]byte("\xe2\x1b]133;D;0\x07"))...)
	for _, e := range evs {
		if e.Kind == KindOut && !strings.Contains(e.Text, "�") {
			t.Fatalf("expected replacement char in %q", e.Text)
		}
	}
	// rune split across feeds is reassembled
	p, _ = newTest()
	p.Feed([]byte("\x1b]133;C\x07"))
	evs = p.Feed([]byte("\xc3"))
	evs = append(evs, p.Feed([]byte("\xa9"))...)
	if got := strings.Join(summarize(evs), "|"); got != "out:é" {
		t.Fatalf("got %q", got)
	}
}
