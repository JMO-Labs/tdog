package term

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/JMO-Labs/tdog/internal/config"
)

// Spec is a terminal preset resolved for launch (spec §7).
type Spec struct {
	Target, Cwd, Command string
	Env                  map[string]string
	Persistent           bool
	Pre, Post, OnClose   *config.Hook
}

var envKeyRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// loadSpec resolves preset name (plus an optional TOML pane override) through
// global → terminal preset → pane override.
func loadSpec(store *config.Store, name, override string) (Spec, error) {
	if store == nil {
		return Spec{}, errors.New("presets are not configured")
	}
	g, err := store.LoadGlobal()
	if err != nil {
		return Spec{}, err
	}
	b, err := store.Get(config.KindTerminal, name)
	if err != nil {
		return Spec{}, err
	}
	v, err := config.Decode(config.KindTerminal, b)
	if err != nil {
		return Spec{}, err
	}
	var pane *config.Terminal
	if override != "" {
		if len(override) > maxOverrideLen {
			return Spec{}, errors.New("override too long")
		}
		pv, err := config.Decode(config.KindTerminal, []byte(override))
		if err != nil {
			return Spec{}, fmt.Errorf("override: %w", err)
		}
		pane = pv.(*config.Terminal)
	}
	return specFromResolved(config.Resolve(g, nil, v.(*config.Terminal), pane))
}

const maxOverrideLen = 8 << 10

func specFromResolved(r config.Resolved) (Spec, error) {
	str := func(k string) string { s, _ := r[k].Value.(string); return s }
	sp := Spec{Target: str("target"), Cwd: str("cwd"), Command: str("command")}
	sp.Persistent, _ = r["persistent"].Value.(bool)
	for k, f := range r {
		key, ok := strings.CutPrefix(k, "env.")
		if !ok {
			continue
		}
		if !envKeyRe.MatchString(key) {
			return Spec{}, fmt.Errorf("env.%s: invalid variable name", key)
		}
		if sp.Env == nil {
			sp.Env = map[string]string{}
		}
		sp.Env[key], _ = f.Value.(string)
	}
	sp.Pre, sp.Post, sp.OnClose = hookOf(r["pre_exec"]), hookOf(r["post_exec"]), hookOf(r["on_close"])
	return sp, nil
}

func hookOf(f config.Field) *config.Hook {
	m, ok := f.Value.(map[string]any)
	if !ok {
		return nil
	}
	mode, _ := m["mode"].(string)
	run, _ := m["run"].([]string)
	return &config.Hook{Mode: mode, Run: run}
}

func sepOf(h *config.Hook) string {
	if h != nil && h.Mode == "stop_on_fail" {
		return " && "
	}
	return "; "
}

func hookScript(h *config.Hook) string {
	if h == nil {
		return ""
	}
	return strings.Join(h.Run, sepOf(h))
}

func noBreaks(s string) bool { return !strings.ContainsAny(s, "\r\n") }

// BuildLine joins pre_exec, command and post_exec into the single line typed
// into the live shell. A hook's mode is the separator within the hook and
// before it: ";" for all, "&&" for stop_on_fail. Ctrl-C on the command aborts
// the whole line, so post_exec is skipped too (documented limit).
func BuildLine(pre *config.Hook, command string, post *config.Hook) (string, error) {
	for _, h := range []*config.Hook{pre, post} {
		if h == nil {
			continue
		}
		for _, s := range h.Run {
			if !noBreaks(s) {
				return "", errors.New("hook commands must be single lines")
			}
		}
	}
	if !noBreaks(command) {
		return "", errors.New("command must be a single line")
	}
	var b strings.Builder
	add := func(s, sep string) {
		if s == "" {
			return
		}
		if b.Len() > 0 {
			b.WriteString(sep)
		}
		b.WriteString(s)
	}
	add(hookScript(pre), "")
	add(command, sepOf(pre))
	add(hookScript(post), sepOf(post))
	return b.String(), nil
}

// shQuote single-quotes s so a POSIX shell reads it as one literal word.
func shQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }

// cdArg quotes a directory but keeps a leading ~ expandable.
func cdArg(dir string) string {
	if dir == "~" {
		return dir
	}
	if rest, ok := strings.CutPrefix(dir, "~/"); ok {
		return "~/" + shQuote(rest)
	}
	return shQuote(dir)
}

func (sp Spec) envKeys() []string {
	keys := make([]string, 0, len(sp.Env))
	for k := range sp.Env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// shellCmd starts the ssh login shell in Cwd with Env; "" means plain shell.
func (sp Spec) shellCmd() string {
	var parts []string
	if sp.Cwd != "" {
		parts = append(parts, "cd "+cdArg(sp.Cwd))
	}
	if len(sp.Env) > 0 {
		var kv []string
		for _, k := range sp.envKeys() {
			kv = append(kv, k+"="+shQuote(sp.Env[k]))
		}
		parts = append(parts, "export "+strings.Join(kv, " "))
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(append(parts, `exec "$SHELL" -l`), " && ")
}

// tmuxCmd attaches/creates the host tmux session for id in Cwd with Env.
func (sp Spec) tmuxCmd(id string) string {
	cmd := tmuxAttachCmd(id)
	for _, k := range sp.envKeys() {
		cmd += " -e " + shQuote(k+"="+sp.Env[k])
	}
	cmd += " \\; set -g allow-passthrough on"
	if sp.Cwd != "" {
		cmd = "cd " + cdArg(sp.Cwd) + " && " + cmd
	}
	return cmd
}

// remoteOnClose is the non-interactive command run over ssh for on_close.
// The hook text is sent as data to the remote shell; it is never spliced into
// a command run by the tdog server itself.
func (sp Spec) remoteOnClose() string {
	script := hookScript(sp.OnClose)
	if sp.OnClose.Mode != "stop_on_fail" && len(sp.OnClose.Run) > 1 {
		script = "{ " + script + "; }"
	}
	parts := []string{}
	if sp.Cwd != "" {
		parts = append(parts, "cd "+cdArg(sp.Cwd))
	}
	for _, k := range sp.envKeys() {
		parts = append(parts, "export "+k+"="+shQuote(sp.Env[k]))
	}
	return strings.Join(append(parts, script), " && ")
}
