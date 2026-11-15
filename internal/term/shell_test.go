package term

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func lookNone(string) (string, error) { return "", errors.New("none") }
func lookBash(string) (string, error) { return "/usr/bin/bash", nil }

func TestPickShell(t *testing.T) {
	cases := []struct {
		name, cfg, env string
		look           func(string) (string, error)
		want           string
	}{
		{"config wins", "/bin/zsh", "/bin/fish", lookBash, "/bin/zsh"},
		{"env next", "", "/bin/zsh", lookBash, "/bin/zsh"},
		{"bash from PATH", "", "", lookBash, "/usr/bin/bash"},
		{"sh last", "", "", lookNone, "/bin/sh"},
	}
	for _, c := range cases {
		if got := pickShell(c.cfg, c.env, c.look); got != c.want {
			t.Errorf("%s: got %q want %q", c.name, got, c.want)
		}
	}
}

func TestShellEnvBashDropsInheritedPrompt(t *testing.T) {
	env := strings.Join(shellEnv("/usr/bin/bash", []string{"A=1", "PS1=old", "PROMPT_COMMAND=x"}), "\n")
	if !strings.Contains(env, "A=1") || !strings.Contains(env, "TERM=xterm-256color") ||
		strings.Contains(env, "PS1=") || strings.Contains(env, "PROMPT_COMMAND") {
		t.Errorf("unexpected env: %s", env)
	}
}

func TestShellArgsBashRCFile(t *testing.T) {
	args := shellArgs("/usr/bin/bash")
	if len(args) != 2 || args[0] != "--rcfile" {
		t.Fatalf("args = %v", args)
	}
	b, err := os.ReadFile(args[1])
	if err != nil {
		t.Fatal(err)
	}
	rc := string(b)
	iSys := strings.Index(rc, "/etc/bash.bashrc")
	iPS1 := strings.Index(rc, "PS1=")
	if iSys < 0 || iPS1 < iSys {
		t.Errorf("PS1 must be set after sourcing /etc/bash.bashrc:\n%s", rc)
	}
	for _, w := range []string{".bashrc", "${USER:-user}", "\\033[32m", "PROMPT_COMMAND=", "\\033]7;file://"} {
		if !strings.Contains(rc, w) {
			t.Errorf("rcfile missing %q:\n%s", w, rc)
		}
	}
}

func TestShellArgsOtherShell(t *testing.T) {
	if a := shellArgs("/bin/zsh"); a != nil {
		t.Errorf("zsh args = %v", a)
	}
}

func TestShellInfoHandlerEscapes(t *testing.T) {
	rec := httptest.NewRecorder()
	ShellInfoHandler(`/x/ba"sh\`).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/shell", nil))
	var v map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil || v["shell"] != `ba"sh\` {
		t.Errorf("got %q err %v", rec.Body.String(), err)
	}
}

func TestShellEnvOtherShellUntouched(t *testing.T) {
	env := strings.Join(shellEnv("/bin/zsh", []string{"A=1"}), "\n")
	if strings.Contains(env, "PS1=") || strings.Contains(env, "PROMPT_COMMAND") {
		t.Errorf("non-bash env modified: %s", env)
	}
}

func TestShellInfoHandler(t *testing.T) {
	rec := httptest.NewRecorder()
	ShellInfoHandler("/usr/bin/bash").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/shell", nil))
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"shell":"bash"}` {
		t.Errorf("got %d %q", rec.Code, rec.Body.String())
	}
}
