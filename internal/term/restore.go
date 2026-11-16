package term

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/JMO-Labs/tdog/internal/frame"
)

const (
	anchorLines  = 3                // output lines kept to align a restore with tmux scrollback
	anchorGap    = 2                // other lines allowed between consecutive anchor lines
	posSlack     = 5                // lines above the park position the last anchor line may sit
	maxParks     = 16               // parks remembered for restore
	maxCaps      = 4                // stored unpark captures (each up to the tmux history)
	capTTL       = 10 * time.Minute // a stored capture is dropped after this
	restoreChunk = 64 << 10         // max Text bytes per restored out event (journal maxOut)
	maxRestore   = 4 << 20          // max restored bytes; older lines are trimmed
	trimmedMark  = "…[earlier lines trimmed]\n"
)

const (
	whyNoAnchor = "restore failed: nothing recorded before the disconnect to align with"
	whyNoReach  = "restore failed: scrollback no longer reaches the gap"
	whyExpired  = "restore failed: the host capture expired; restore within 10 minutes of reconnecting"
	whyUnknown  = "restore failed: nothing to restore for this gap"
	whyOff      = "Recording is off for this pane."
	whyRestFail = "restore failed: "
)

// parkInfo is what a restore of one park's gap needs.
type parkInfo struct {
	anchor []string // last output lines before the park
	pos    int      // cursor line at park (tmux display), -1 if unknown
	hasCap bool     // scr/capErr hold the capture taken at unpark
	scr    string
	capErr error
	capAt  time.Time
}

// track keeps the last anchorLines complete non-empty output lines; callers
// hold j.mu.
func (j *jrnl) track(text string) {
	lines := strings.Split(j.partial+text, "\n")
	j.partial = lines[len(lines)-1]
	for _, l := range lines[:len(lines)-1] {
		if l = strings.TrimRight(l, " \t\r"); l != "" && l+"\n" != "[full-screen app]\n" {
			j.tail = append(j.tail, l)
		}
	}
	if n := len(j.tail); n > anchorLines {
		j.tail = append([]string(nil), j.tail[n-anchorLines:]...)
	}
}

// idle reports whether the shell sat at a prompt with no output for d as of now.
func (j *jrnl) idle(now time.Time, d time.Duration) bool {
	if j == nil {
		return false
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.on && j.p.HasMarkers() && j.p.AtPrompt() && now.Sub(j.last) >= d
}

// gap adds a gap event and returns its rec (0 while recording is off).
// Callers hold j.mu.
func (j *jrnl) gap(why string) uint64 {
	if !j.on {
		return 0
	}
	evs := j.p.Gap(why)
	j.add(evs)
	return evs[len(evs)-1].Rec + j.recBase
}

// parkGap marks the disconnect and remembers how to align a restore: the
// output tail and pos, the cursor line at park (-1 if unknown). It returns
// the gap rec (0 while recording is off).
func (j *jrnl) parkGap(pos int) uint64 {
	if j == nil {
		return 0
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	rec := j.gap("disconnected")
	if rec == 0 {
		return 0
	}
	if j.parks == nil {
		j.parks = map[uint64]*parkInfo{}
	}
	j.parks[rec] = &parkInfo{anchor: j.tail, pos: pos} // track replaces tail, never mutates it
	if len(j.parks) > maxParks {
		delete(j.parks, oldest(j.parks, func(*parkInfo) bool { return true }))
	}
	return rec
}

// dropParks forgets every park, stored capture and output tail (forget,
// kill, end): none of that plaintext may outlive the journal it came from.
func (j *jrnl) dropParks() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.dropParksLocked()
}

// dropParksLocked is dropParks for callers holding j.mu. Bumping parkGen
// voids a restore that already took its park but has not written yet.
func (j *jrnl) dropParksLocked() {
	j.parks, j.tail, j.partial = nil, nil, ""
	j.parkGen++
}

// oldest is the lowest rec whose info matches keep (0 if none).
func oldest(m map[uint64]*parkInfo, keep func(*parkInfo) bool) uint64 {
	var lo uint64
	for k, p := range m {
		if keep(p) && (lo == 0 || k < lo) {
			lo = k
		}
	}
	return lo
}

// storeCapture keeps the scrollback taken at unpark for gap rec, before any
// post-unpark output exists. At most maxCaps are held.
func (j *jrnl) storeCapture(rec uint64, scr string, err error, now time.Time) {
	if j == nil {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	p := j.parks[rec]
	if p == nil {
		return
	}
	p.hasCap, p.scr, p.capErr, p.capAt = true, newestTail(scr), err, now
	held := func(p *parkInfo) bool { return p.hasCap }
	for n := 0; ; n = 0 {
		for _, q := range j.parks {
			if held(q) {
				n++
			}
		}
		if n <= maxCaps {
			return
		}
		drop := j.parks[oldest(j.parks, held)]
		drop.hasCap, drop.scr, drop.capErr = false, "", nil
	}
}

// expireCaps drops stored captures older than capTTL as of now.
func (j *jrnl) expireCaps(now time.Time) {
	if j == nil {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	for _, p := range j.parks {
		if p.hasCap && now.Sub(p.capAt) > capTTL {
			p.hasCap, p.scr, p.capErr = false, "", nil
		}
	}
}

// restore emits the output missed during the park that left gap rec, as out
// events for rec, or a "restore failed" gap. Each gap restores at most once.
// An unknown rec (or a session that never parked) only gets an error control.
func (j *jrnl) restore(rec uint64, reply func([]byte) error) {
	fail := func(msg string) {
		if reply != nil {
			_ = reply(frame.ErrorControl(msg))
		}
	}
	j.mu.Lock()
	on, gen, p := j.on, j.parkGen, j.parks[rec]
	if on {
		delete(j.parks, rec)
	}
	j.mu.Unlock()
	if !on {
		fail(whyOff)
		return
	}
	if p == nil {
		fail(whyUnknown)
		return
	}
	var text, why string
	switch {
	case !p.hasCap:
		why = whyExpired
	case p.capErr != nil:
		why = whyRestFail + p.capErr.Error()
	default:
		text, why = p.missed()
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.parkGen != gen || !j.on { // forgotten, killed or switched off meanwhile
		return
	}
	if why != "" {
		j.gap(why)
		return
	}
	for _, c := range restorePieces(text) {
		for _, e := range j.p.Out(c) {
			e.Seq += j.base
			e.Rec = rec
			j.max = e.Seq
			j.buf.Add(e)
		}
	}
}

// missed returns the capture's lines from the park on, or why it cannot.
// The cursor position wins when the last anchor line sits just above it
// (history trimming shifts positions, which this check catches); otherwise
// the last windowed occurrence of the anchor marks the park.
func (p *parkInfo) missed() (string, string) {
	lines := strings.Split(p.scr, "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " \t\r")
	}
	start := -1
	switch {
	case p.pos >= 0 && p.pos < len(lines) && nearAnchor(lines, p.pos, p.anchor):
		start = p.pos
	case len(p.anchor) == 0 && p.pos < 0:
		return "", whyNoAnchor
	default:
		end, ok := findAnchor(lines, p.anchor)
		if !ok {
			return "", whyNoReach
		}
		start = end + 1
	}
	rest := lines[start:]
	for len(rest) > 0 && rest[len(rest)-1] == "" {
		rest = rest[:len(rest)-1]
	}
	if len(rest) == 0 {
		return "", ""
	}
	return strings.Join(rest, "\n") + "\n", ""
}

// nearAnchor reports whether the last anchor line is within posSlack lines
// above pos (trivially true without an anchor).
func nearAnchor(lines []string, pos int, anchor []string) bool {
	if len(anchor) == 0 {
		return true
	}
	for i := max(0, pos-posSlack); i < pos; i++ {
		if lines[i] == anchor[len(anchor)-1] {
			return true
		}
	}
	return false
}

// findAnchor returns the index of the last line of the last occurrence of
// anchor in lines, allowing at most anchorGap other lines (prompts, commands)
// between consecutive anchor lines.
func findAnchor(lines, anchor []string) (int, bool) {
	n := len(anchor)
	if n == 0 {
		return 0, false
	}
	for end := len(lines) - 1; end >= 0; end-- {
		if lines[end] != anchor[n-1] {
			continue
		}
		at, ok := end, true
		for k := n - 2; k >= 0 && ok; k-- {
			ok = false
			for i := at - 1; i >= 0 && i >= at-1-anchorGap; i-- {
				if lines[i] == anchor[k] {
					at, ok = i, true
					break
				}
			}
		}
		if ok {
			return end, true
		}
	}
	return 0, false
}

// restorePieces makes restored text valid UTF-8, keeps its newest maxRestore
// bytes (behind trimmedMark when cut) and splits it into out-event pieces.
func restorePieces(text string) []string {
	return chunks(newestTail(text), restoreChunk)
}

// newestTail is text as valid UTF-8, cut to its newest maxRestore bytes
// behind trimmedMark when longer.
func newestTail(text string) string {
	s := strings.ToValidUTF8(text, "\uFFFD")
	if len(s) <= maxRestore {
		return s
	}
	if len(s) <= maxRestore+len(trimmedMark) && strings.HasPrefix(s, trimmedMark) {
		return s // already cut (stored captures are cut at store time)
	}
	i := len(s) - maxRestore
	for i < len(s) && !utf8.RuneStart(s[i]) {
		i++
	}
	return trimmedMark + s[i:]
}

// chunks splits s into pieces of at most n bytes, never splitting a rune of
// valid UTF-8; every pass makes progress whatever the input.
func chunks(s string, n int) []string {
	var out []string
	for len(s) > n {
		i := n
		for i > 0 && !utf8.RuneStart(s[i]) {
			i--
		}
		if i == 0 {
			i = n // no rune start to back up to: cut anyway
		}
		out = append(out, s[:i])
		s = s[i:]
	}
	return append(out, s)
}
