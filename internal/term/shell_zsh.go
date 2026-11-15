package term

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// zshRC is our ~/.zshrc stand-in (ZDOTDIR points at its directory). It
// restores the user's ZDOTDIR, sources their .zshrc first, then installs
// OSC 7 and OSC 133 hooks. B sits at the end of PROMPT inside %{ %}.
const zshRC = `ZDOTDIR="${TDOG_USER_ZDOTDIR:-$HOME}"
unset TDOG_USER_ZDOTDIR
[ -r "$ZDOTDIR/.zshrc" ] && . "$ZDOTDIR/.zshrc"
__tdog_precmd() {
  local e=$?
  [ -n "$__tdog_ran" ] && printf '\033]133;D;%s\033\\' "$e"
  __tdog_ran=1
  printf '\033]7;file://%s%s\033\\' "$HOST" "$PWD"
  printf '\033]133;A\033\\'
}
__tdog_preexec() { printf '\033]133;C\033\\'; }
precmd_functions=(__tdog_precmd $precmd_functions)
preexec_functions+=(__tdog_preexec)
PROMPT="${PROMPT}%{"$'\033]133;B\033\\'"%}"
`

// zshEnvRC forwards .zshenv, which zsh would otherwise look for in our dir.
const zshEnvRC = `[ -r "${TDOG_USER_ZDOTDIR:-$HOME}/.zshenv" ] && . "${TDOG_USER_ZDOTDIR:-$HOME}/.zshenv"
`

var (
	zshOnce sync.Once
	zshDir  string
)

// zshDotDir writes our .zshrc/.zshenv to a private temp dir once.
func zshDotDir() string {
	zshOnce.Do(func() {
		d, err := os.MkdirTemp("", "tdog-zdotdir-*")
		if err != nil {
			return
		}
		for name, body := range map[string]string{".zshrc": zshRC, ".zshenv": zshEnvRC} {
			if os.WriteFile(filepath.Join(d, name), []byte(body), 0o600) != nil {
				return
			}
		}
		zshDir = d
	})
	return zshDir
}

// zshEnv points ZDOTDIR at our dir, remembering the user's own.
func zshEnv(env []string) []string {
	d := zshDotDir()
	if d == "" {
		return env
	}
	user := ""
	kept := env[:0]
	for _, e := range env {
		if v, ok := strings.CutPrefix(e, "ZDOTDIR="); ok {
			user = v
			continue
		}
		kept = append(kept, e)
	}
	return append(kept, "ZDOTDIR="+d, "TDOG_USER_ZDOTDIR="+user)
}
