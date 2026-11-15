package term

import (
	"bytes"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/creack/pty"

	"github.com/JMO-Labs/tdog/internal/journal"
)

// runMarked runs shell in a PTY with our rc wiring, types true and false, and
// returns the journal "end" events and the cmds seen on them.
func runMarked(t *testing.T, shell string) (cmds []string, exits []int) {
	t.Helper()
	home := t.TempDir()
	base := []string{"HOME=" + home, "PATH=" + os.Getenv("PATH"), "USER=tester"}
	cmd := exec.Command(shell, shellArgs(shell)...)
	cmd.Env = shellEnv(shell, base)
	cmd.Dir = home
	f, err := pty.Start(cmd)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = f.Close(); _, _ = cmd.Process.Wait() }()

	out := make(chan []byte, 64)
	go func() {
		b := make([]byte, 4096)
		for {
			n, err := f.Read(b)
			if n > 0 {
				out <- append([]byte(nil), b[:n]...)
			}
			if err != nil {
				close(out)
				return
			}
		}
	}()
	p := journal.NewParser(time.Now)
	var all bytes.Buffer
	feed := func(b []byte) {
		all.Write(b)
		for _, e := range p.Feed(b) {
			if e.Kind == "end" && e.Exit != nil {
				exits = append(exits, *e.Exit)
			}
			if e.Kind == "start" && e.Cmd != "" { // skips the pre-prompt slice
				cmds = append(cmds, e.Cmd)
			}
		}
	}
	deadline := time.After(15 * time.Second)
	wait := func(marker string, n int) {
		for strings.Count(all.String(), marker) < n {
			select {
			case b, ok := <-out:
				if !ok {
					t.Fatalf("shell exited early: %q", all.String())
				}
				feed(b)
			case <-deadline:
				t.Fatalf("timeout waiting for %q in %q", marker, all.String())
			}
		}
	}
	wait("133;B", 1) // first prompt ready
	// Type key by key, as a user would; a burst makes zle redraw with \b.
	typeLine := func(l string) {
		for _, c := range l {
			_, _ = f.WriteString(string(c))
			time.Sleep(5 * time.Millisecond)
		}
	}
	typeLine("true\n")
	wait("133;B", 2) // next prompt ready
	typeLine("false\n")
	// the third prompt closes the last record
	wait("133;B", 3)
	return cmds, exits
}

func checkMarked(t *testing.T, shell string) {
	cmds, exits := runMarked(t, shell)
	if len(exits) < 2 || exits[0] != 0 || exits[1] != 1 {
		t.Fatalf("exits = %v", exits)
	}
	if len(cmds) < 2 || cmds[0] != "true" || cmds[1] != "false" {
		t.Fatalf("cmds = %q", cmds)
	}
}

func TestBashMarkers(t *testing.T) {
	p, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("no bash")
	}
	checkMarked(t, p)
}

func TestZshMarkers(t *testing.T) {
	p, err := exec.LookPath("zsh")
	if err != nil {
		t.Skip("no zsh")
	}
	checkMarked(t, p)
}
