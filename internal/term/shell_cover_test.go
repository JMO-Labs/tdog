package term

import (
	"path/filepath"
	"sync"
	"testing"
)

func TestBashRCFileCreateTempFails(t *testing.T) {
	t.Cleanup(func() { rcOnce, rcPath = sync.Once{}, "" })
	rcOnce, rcPath = sync.Once{}, ""
	t.Setenv("TMPDIR", filepath.Join(t.TempDir(), "missing"))
	if got := bashRCFile(); got != "" {
		t.Errorf("bashRCFile = %q, want empty when temp file cannot be created", got)
	}
	if args := shellArgs("/usr/bin/bash"); args != nil {
		t.Errorf("shellArgs = %v, want nil without rcfile", args)
	}
}

func TestPickShellUsesEnvironment(t *testing.T) {
	t.Setenv("SHELL", "/bin/zsh")
	if got := PickShell(""); got != "/bin/zsh" {
		t.Errorf("PickShell = %q, want $SHELL", got)
	}
	if got := PickShell("/bin/fish"); got != "/bin/fish" {
		t.Errorf("PickShell = %q, want configured shell", got)
	}
}
