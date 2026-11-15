package term

import (
	"strings"
	"time"
)

const (
	anchorLines = 3  // output lines kept to align a restore with tmux scrollback
	maxAnchors  = 16 // parks remembered for restore
)

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

// parkGap marks the disconnect and remembers the output tail to align on.
func (j *jrnl) parkGap() {
	if j == nil {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	rec := j.gap("disconnected")
	if rec == 0 {
		return
	}
	if j.anchors == nil {
		j.anchors = map[uint64][]string{}
	}
	j.anchors[rec] = j.tail // track replaces tail rather than mutating it
	if len(j.anchors) > maxAnchors {
		delete(j.anchors, minKey(j.anchors)) // forget the oldest park
	}
}

func minKey(m map[uint64][]string) uint64 {
	var lo uint64
	for k := range m {
		if lo == 0 || k < lo {
			lo = k
		}
	}
	return lo
}

// restore pulls the output missed during the park that left gap rec from the
// host's tmux scrollback: one out event for rec, or a "restore failed" gap.
func (j *jrnl) restore(rec uint64) {
	j.mu.Lock()
	anchor, ok := j.anchors[rec]
	j.mu.Unlock()
	var why, text string
	switch {
	case j.snap == nil:
		why = "restore failed: not a host session"
	case !ok:
		why = "restore failed: unknown gap"
	default:
		scr, err := j.snap()
		if err != nil {
			why = "restore failed: " + err.Error()
		} else if text, ok = after(scr, anchor); !ok {
			why = "restore failed: scrollback no longer reaches the gap"
		}
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if why != "" {
		j.gap(why)
		return
	}
	if !j.on {
		return
	}
	for _, e := range j.p.Out(text) {
		e.Seq += j.base
		e.Rec = rec
		j.max = e.Seq
		j.buf.Add(e)
	}
}

// after returns the lines of scr following the last occurrence of anchor.
// Anchor lines are output only, while scr also holds prompts and commands, so
// they must appear in order but need not be adjacent.
func after(scr string, anchor []string) (string, bool) {
	if len(anchor) == 0 {
		return "", false
	}
	lines := strings.Split(scr, "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " \t\r")
	}
	end, k := -1, len(anchor)-1
	for i := len(lines) - 1; i >= 0 && k >= 0; i-- {
		if lines[i] == anchor[k] {
			if k == len(anchor)-1 {
				end = i
			}
			k--
		}
	}
	if k >= 0 {
		return "", false
	}
	rest := lines[end+1:]
	for len(rest) > 0 && rest[len(rest)-1] == "" {
		rest = rest[:len(rest)-1]
	}
	if len(rest) == 0 {
		return "", true
	}
	return strings.Join(rest, "\n") + "\n", true
}
