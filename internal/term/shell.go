package term

import (
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// pickShell chooses the container shell: configured, then $SHELL, then bash
// on PATH, then /bin/sh.
func pickShell(cfg, env string, look func(string) (string, error)) string {
	if cfg != "" {
		return cfg
	}
	if env != "" {
		return env
	}
	if p, err := look("bash"); err == nil {
		return p
	}
	return "/bin/sh"
}

func lookPath(name string) (string, error) { return exec.LookPath(name) }

// bashPS1 is a coloured user@host:cwd prompt using ANSI colours (so themes apply).
const bashPS1 = `\[\033[32m\]\u@\h\[\033[0m\]:\[\033[34m\]\w\[\033[0m\]\$ `

// bashPromptCmd emits OSC 7 (cwd) before each prompt.
const bashPromptCmd = `printf '\033]7;file://%s%s\033\\' "$HOSTNAME" "$PWD"`

// shellEnv returns base plus TERM; for bash it also sets the coloured prompt
// and an OSC 7 cwd report.
func shellEnv(shell string, base []string) []string {
	env := append([]string{}, base...)
	if filepath.Base(shell) == "bash" {
		kept := env[:0]
		for _, e := range env {
			if !strings.HasPrefix(e, "PS1=") && !strings.HasPrefix(e, "PROMPT_COMMAND=") {
				kept = append(kept, e)
			}
		}
		env = append(kept, "PS1="+bashPS1, "PROMPT_COMMAND="+bashPromptCmd)
	}
	return append(env, "TERM=xterm-256color")
}

// ShellInfoHandler reports the container shell's basename as {"shell":"bash"}.
// Callers must wrap it with authentication.
func ShellInfoHandler(shell string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"shell":"` + filepath.Base(shell) + `"}`))
	})
}

// PickShell resolves the container shell from the environment.
func PickShell(cfg string) string { return pickShell(cfg, os.Getenv("SHELL"), lookPath) }
