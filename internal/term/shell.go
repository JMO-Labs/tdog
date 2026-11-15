package term

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
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

// bashRC is our bash rcfile: it sources the system and user rc files (Debian's
// /etc/bash.bashrc overwrites PS1 unconditionally), then sets a coloured
// user@host:cwd prompt (ANSI colours so themes apply) and emits OSC 7 (cwd)
// before each prompt. ${USER:-user} avoids "I have no name!" for uids
// without a passwd entry.
const bashRC = `[ -r /etc/bash.bashrc ] && . /etc/bash.bashrc
[ -r "$HOME/.bashrc" ] && . "$HOME/.bashrc"
PS1='\[\033[32m\]'"${USER:-user}"'@\h\[\033[0m\]:\[\033[34m\]\w\[\033[0m\]\$ '
PROMPT_COMMAND='printf "\033]7;file://%s%s\033\\\\" "$HOSTNAME" "$PWD"'
`

var (
	rcOnce sync.Once
	rcPath string
)

// bashRCFile writes bashRC to a private temp file once and returns its path.
func bashRCFile() string {
	rcOnce.Do(func() {
		f, err := os.CreateTemp("", "tdog-bashrc-*")
		if err != nil {
			return
		}
		_, werr := f.WriteString(bashRC)
		if cerr := f.Close(); werr == nil && cerr == nil {
			rcPath = f.Name() // only use the rc file if it was fully written
		}
	})
	return rcPath
}

// shellArgs returns extra arguments for the shell: bash gets our rcfile.
func shellArgs(shell string) []string {
	if filepath.Base(shell) == "bash" {
		if rc := bashRCFile(); rc != "" {
			return []string{"--rcfile", rc}
		}
	}
	return nil
}

// shellEnv returns base plus TERM and COLORTERM, without inherited prompt variables for bash.
func shellEnv(shell string, base []string) []string {
	env := append([]string{}, base...)
	if filepath.Base(shell) == "bash" {
		kept := env[:0]
		for _, e := range env {
			if !strings.HasPrefix(e, "PS1=") && !strings.HasPrefix(e, "PROMPT_COMMAND=") {
				kept = append(kept, e)
			}
		}
		env = kept
	}
	return append(env, "TERM=xterm-256color", "COLORTERM=truecolor")
}

// ShellInfoHandler reports the container shell's basename as {"shell":"bash"}.
// Callers must wrap it with authentication.
func ShellInfoHandler(shell string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"shell": filepath.Base(shell)})
	})
}

// PickShell resolves the container shell from the environment.
func PickShell(cfg string) string { return pickShell(cfg, os.Getenv("SHELL"), lookPath) }
