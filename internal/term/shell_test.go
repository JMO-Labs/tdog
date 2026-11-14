package term

import (
	"errors"
	"net/http"
	"net/http/httptest"
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

func TestShellEnvBashPrompt(t *testing.T) {
	env := strings.Join(shellEnv("/usr/bin/bash", []string{"A=1", "PS1=old"}), "\n")
	for _, w := range []string{"TERM=xterm-256color", "A=1", "PROMPT_COMMAND=", "\\033]7;file://"} {
		if !strings.Contains(env, w) {
			t.Errorf("env missing %q: %s", w, env)
		}
	}
	if strings.Contains(env, "PS1=old") || !strings.Contains(env, "\\[\\033[") {
		t.Errorf("PS1 not replaced with coloured prompt: %s", env)
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
