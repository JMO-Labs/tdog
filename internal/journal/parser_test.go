package journal

import (
	"fmt"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
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
			[]string{"start:", "out:100%\nok\n", "end:0"}, true, false, true},
		{"double cr then lf",
			"\x1b]133;C\x07hello\r\r\nworld\r\n\x1b]133;D;0\x07",
			[]string{"start:", "out:hello\nworld\n", "end:0"}, true, false, true},
		{"esc esc keeps second",
			"\x1b]133;C\x07a\n\x1b\x1b]133;D;0\x07",
			[]string{"start:", "out:a\n", "end:0"}, true, false, true},
		{"ss3 swallowed",
			"\x1b]133;C\x07a\x1bOPb\n\x1b]133;D;0\x07",
			[]string{"start:", "out:ab\n", "end:0"}, true, false, true},
		{"D with empty exit",
			"\x1b]133;C\x07a\n\x1b]133;D;\x07",
			[]string{"start:", "out:a\n", "end:-"}, true, false, true},
		{"D with aid",
			"\x1b]133;C\x07a\n\x1b]133;D;0;aid=5\x07",
			[]string{"start:", "out:a\n", "end:0"}, true, false, true},
		{"osc 133 terminated by ST",
			"\x1b]133;C\x1b\\a\n\x1b]133;D;3\x1b\\",
			[]string{"start:", "out:a\n", "end:3"}, true, false, true},
		{"mark compares whole field",
			"\x1b]133;Cx\x07a\n",
			[]string{"start:", "out:a\n"}, false, false, false},
		{"cmd keeps newlines and ignores prompt text",
			"\x1b]133;A\x07$ typed\x1b]133;B\x07cat <<EOF\nfoo\nEOF\r\x1b]133;C\x07",
			[]string{"start:cat <<EOF\nfoo\nEOF"}, false, false, true},
		{"output after D joins ended rec",
			"\x1b]133;C\x07a\n\x1b]133;D;0\x07late\n\x1b]133;A\x07prompt\x1b]133;B\x07",
			[]string{"start:", "out:a\n", "end:0", "out:late\n"}, false, false, true},
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

func outs(evs []Event) []string {
	var o []string
	for _, e := range evs {
		if e.Kind == KindOut {
			o = append(o, e.Text)
		}
	}
	return o
}

func TestFullScreenApp(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{"1049", []string{"\x1b]133;C\x07\x1b[?1049hjunk\x1b[2J\x1b[H more\x1b[?1049l\x1b]133;D;0\x07"}, []string{"[full-screen app]\n"}},
		{"47", []string{"\x1b]133;C\x07\x1b[?47hjunk\x1b[?47l\x1b]133;D;0\x07"}, []string{"[full-screen app]\n"}},
		{"split across feeds", []string{"\x1b]133;C\x07\x1b[?10", "49hjunk\x1b[?10", "49l\x1b]133;D;0\x07"}, []string{"[full-screen app]\n"}},
		{"new line after open line", []string{"\x1b]133;C\x07abc\x1b[?1049hxx\x1b[?1049l\x1b]133;D;0\x07"}, []string{"abc", "\n[full-screen app]\n"}},
		{"killed then next prompt", []string{"\x1b]133;C\x07\x1b[?1049hjunk", "\x1b]133;A\x07\x1b]133;C\x07after\n\x1b]133;D;0\x07"}, []string{"[full-screen app]\n", "after\n"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, _ := newTest()
			var evs []Event
			for _, in := range tc.in {
				evs = append(evs, p.Feed([]byte(in))...)
			}
			got := outs(evs)
			if strings.Join(got, "|") != strings.Join(tc.want, "|") {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

func TestNoMarkersTimeSlicing(t *testing.T) {
	p, c := newTest()
	evs := p.Feed([]byte("x"))
	c.t = c.t.Add(3 * time.Second)
	evs = append(evs, p.Feed([]byte("y"))...)
	evs = append(evs, p.Flush(c.t)...)
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
	evs = p.Feed([]byte("x"))
	c.t = c.t.Add(time.Second)
	evs = append(evs, p.Feed([]byte("y"))...)
	evs = append(evs, p.Flush(c.t)...)
	if got := strings.Join(summarize(evs), "|"); got != "start:|out:xy" {
		t.Fatalf("got %s", got)
	}
}

func TestFlushTick(t *testing.T) {
	p, c := newTest()
	p.Feed([]byte("Password: "))
	// tail held until flushed
	evs := p.Flush(c.t)
	if got := strings.Join(summarize(evs), "|"); got != "out:Password: " {
		t.Fatalf("got %s", got)
	}
	// idle 2s ends the slice without further input
	evs = p.Flush(c.t.Add(2 * time.Second))
	if got := strings.Join(summarize(evs), "|"); got != "end:-" {
		t.Fatalf("got %s", got)
	}
	if evs = p.Flush(c.t.Add(5 * time.Second)); len(evs) != 0 {
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
	gev := p.Gap("parked")
	g := gev[len(gev)-1]
	if len(gev) != 1 || g.Kind != KindGap || g.Why != "parked" || g.Seq <= last.Seq || g.Rec == 0 || g.Rec == last.Rec {
		t.Fatalf("gap=%+v last=%+v", gev, last)
	}
	next := p.Feed([]byte("\x1b]133;C\x07"))
	if next[0].Seq <= g.Seq || next[0].Rec <= g.Rec {
		t.Fatalf("next=%+v gap=%+v", next[0], g)
	}
}

func TestGapMidCommand(t *testing.T) {
	p, _ := newTest()
	evs := p.Feed([]byte("\x1b]133;C\x07part\nhal\x1b[3"))
	start := evs[0]
	gev := p.Gap("restore")
	if got := strings.Join(summarize(gev), "|"); got != "out:hal|end:-|gap:restore" {
		t.Fatalf("got %s", got)
	}
	end, gap := gev[len(gev)-2], gev[len(gev)-1]
	if end.Rec != start.Rec || gap.Rec <= start.Rec || end.Seq >= gap.Seq {
		t.Fatalf("end=%+v gap=%+v start=%+v", end, gap, start)
	}
	// scanner reset: a stray 'm' after the cut CSI is plain text, markers still work
	next := p.Feed([]byte("\x1b]133;C\x07m\n\x1b]133;D;0\x07"))
	if next[0].Rec <= gap.Rec || strings.Join(summarize(next), "|") != "start:|out:m\n|end:0" {
		t.Fatalf("next=%v", next)
	}
}

func TestOutCap(t *testing.T) {
	p, c := newTest()
	p.Feed([]byte("\x1b]133;C\x07"))
	evs := p.Feed([]byte(strings.Repeat("a", 200000)))
	evs = append(evs, p.Flush(c.t)...)
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

func TestOutCapMultibyte(t *testing.T) {
	for _, r := range []string{"é", "✓", "\U0001F600"} {
		p, c := newTest()
		p.Feed([]byte("\x1b]133;C\x07"))
		in := strings.Repeat(r, 100000)
		evs := p.Feed([]byte(in))
		evs = append(evs, p.Flush(c.t)...)
		var sb strings.Builder
		for _, e := range evs {
			if e.Kind != KindOut {
				continue
			}
			if !utf8.ValidString(e.Text) || len(e.Text) > maxOut {
				t.Fatalf("%q: bad out len=%d valid=%v", r, len(e.Text), utf8.ValidString(e.Text))
			}
			sb.WriteString(e.Text)
		}
		if sb.String() != in {
			t.Fatalf("%q: text mismatch", r)
		}
	}
}

func TestCRHugeFeedLinear(t *testing.T) {
	p, c := newTest()
	p.Feed([]byte("\x1b]133;C\x07"))
	in := strings.Repeat("x\r", 400000)
	done := make(chan struct{})
	go func() { p.Feed([]byte(in)); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("quadratic CR handling")
	}
	_ = c
}

func TestUnterminatedSequencesBounded(t *testing.T) {
	for _, intro := range []string{"\x1b]0;", "\x1b[1;", "\x1bP", "\x1b(" + strings.Repeat(" ", 10)} {
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
}

func TestOversizedStringNotJournaled(t *testing.T) {
	for _, tc := range []struct{ intro, term string }{
		{"\x1b]1337;File=", "\x07"},
		{"\x1b]52;c;", "\x1b\\"},
		{"\x1bP0;1q", "\x1b\\"},
	} {
		p, c := newTest()
		in := "\x1b]133;C\x07" + tc.intro + strings.Repeat("QUJD", 2500) + tc.term + "after\n\x1b]133;D;0\x07"
		evs := p.Feed([]byte(in[:6000]))
		if len(p.buf) > maxSeq {
			t.Fatalf("buf %d", len(p.buf))
		}
		evs = append(evs, p.Feed([]byte(in[6000:]))...)
		evs = append(evs, p.Flush(c.t)...)
		if got := strings.Join(summarize(evs), "|"); got != "start:|out:after\n|end:0" {
			t.Fatalf("%q: got %.80q", tc.intro, got)
		}
	}
	// an oversized OSC 133 is ignored, not acted upon
	p, _ := newTest()
	p.Feed([]byte("\x1b]133;A;" + strings.Repeat("k=v;", 2000) + "\x07"))
	if p.HasMarkers() {
		t.Fatal("overflowed OSC acted upon")
	}
}

func TestCSIAbort(t *testing.T) {
	p, _ := newTest()
	// CAN aborts the CSI, ESC starts a new sequence (the D marker)
	got := summarize(p.Feed([]byte("\x1b]133;C\x07a\x1b[1\x18b\x1b[2\x1b]133;D;0\x07")))
	if strings.Join(got, "|") != "start:|out:ab|end:0" {
		t.Fatalf("got %q", got)
	}
}

func TestInvalidUTF8(t *testing.T) {
	p, c := newTest()
	evs := p.Feed([]byte("\x1b]133;B\x07\xff\xfe\x1b]133;C\x07\xff\xfe\xc3(\xe2\x82"))
	evs = append(evs, p.Feed([]byte("\xe2\x1b]133;D;0\x07"))...)
	n := 0
	for _, e := range evs {
		if !utf8.ValidString(e.Text) || !utf8.ValidString(e.Cmd) {
			t.Fatalf("invalid utf8 in %+v", e)
		}
		if e.Kind == KindOut {
			n++
			if !strings.Contains(e.Text, "�") {
				t.Fatalf("expected replacement char in %q", e.Text)
			}
		}
	}
	if n == 0 {
		t.Fatal("no out")
	}
	// rune split across feeds is reassembled
	p, _ = newTest()
	p.Feed([]byte("\x1b]133;C\x07"))
	evs = p.Feed([]byte("\xc3"))
	evs = append(evs, p.Feed([]byte("\xa9"))...)
	evs = append(evs, p.Flush(c.t)...)
	if got := strings.Join(summarize(evs), "|"); got != "out:é" {
		t.Fatalf("got %q", got)
	}
}
