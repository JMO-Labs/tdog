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
//
// OSC 133 (shell integration) markers feed the session journal: A prompt
// start, B prompt end (end of PS1, inside \[ \] to keep readline widths
// right), C output start (PS0, expanded just before the command runs), and
// D;exit command end. __tdog_pc captures $? as its first statement and skips
// D on the very first prompt, when no command has run yet.
const bashRC = `[ -r /etc/bash.bashrc ] && . /etc/bash.bashrc
[ -r "$HOME/.bashrc" ] && . "$HOME/.bashrc"
__tdog_cwd() { printf '\033]7;file://%s%s\033\\' "$HOSTNAME" "$PWD"; }
__tdog_pc() {
  local e=$?
  [ -n "$__tdog_ran" ] && printf '\033]133;D;%s\033\\' "$e"
  __tdog_ran=1
  __tdog_cwd
  printf '\033]133;A\033\\'
}
PS1='\[\033[32m\]'"${USER:-user}"'@\h\[\033[0m\]:\[\033[34m\]\w\[\033[0m\]\$ '
# PS0 (the C marker) needs bash >= 4.4; without it emit no OSC 133 at all so
# the journal falls back to time-sliced records. Our hooks go first and keep
# the user's own PROMPT_COMMAND/PS0.
if (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) )); then
  PS1="$PS1"'\[\033]133;B\033\\\]'
  PS0='\033]133;C\033\\'"$PS0"
  __tdog_hook=__tdog_pc
else
  __tdog_hook=__tdog_cwd
fi
if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == "declare -a"* ]] && (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
  PROMPT_COMMAND=("$__tdog_hook" "${PROMPT_COMMAND[@]}")
else
  PROMPT_COMMAND="$__tdog_hook${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
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
	return nil // zsh finds our rc through ZDOTDIR, see shellEnv
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
	if filepath.Base(shell) == "zsh" {
		env = zshEnv(env)
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
