package term

import (
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/config"
	"github.com/JMO-Labs/tdog/internal/frame"
)

func hook(mode string, run ...string) *config.Hook { return &config.Hook{Mode: mode, Run: run} }

func TestBuildLine(t *testing.T) {
	cases := []struct {
		name      string
		pre       *config.Hook
		cmd       string
		post      *config.Hook
		want      string
		wantEmpty bool
	}{
		{name: "command only", cmd: "npm run dev", want: "npm run dev"},
		{name: "pre all", pre: hook("all", "a", "b"), cmd: "c", want: "a; b; c"},
		{name: "pre stop_on_fail", pre: hook("stop_on_fail", "a", "b"), cmd: "c", want: "a && b && c"},
		{name: "post all", cmd: "c", post: hook("all", "x", "y"), want: "c; x; y"},
		{name: "post stop_on_fail", cmd: "c", post: hook("stop_on_fail", "x", "y"), want: "c && x && y"},
		{name: "mixed", pre: hook("stop_on_fail", "a", "b"), cmd: "c", post: hook("all", "x"), want: "a && b && c; x"},
		{name: "no command", pre: hook("all", "a"), post: hook("all", "x"), want: "a; x"},
		{name: "empty", wantEmpty: true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := BuildLine(c.pre, c.cmd, c.post)
			if err != nil || got != c.want {
				t.Fatalf("got %q, %v; want %q", got, err, c.want)
			}
		})
	}
}

func TestBuildLineRejectsLineBreaks(t *testing.T) {
	for _, bad := range []string{"a\nb", "a\rb"} {
		if _, err := BuildLine(hook("all", bad), "c", nil); err == nil {
			t.Fatalf("%q accepted", bad)
		}
		if _, err := BuildLine(nil, bad, nil); err == nil {
			t.Fatalf("command %q accepted", bad)
		}
	}
}

func TestShQuoteIsData(t *testing.T) {
	cases := map[string]string{
		"plain":      `'plain'`,
		"it's":       `'it'\''s'`,
		"$(rm -rf)":  `'$(rm -rf)'`,
		"a; touch x": `'a; touch x'`,
	}
	for in, want := range cases {
		if got := shQuote(in); got != want {
			t.Errorf("shQuote(%q) = %q, want %q", in, got, want)
		}
	}
	if got := cdArg("~/code/my app"); got != `~/'code/my app'` {
		t.Errorf("cdArg tilde: %q", got)
	}
	if got := cdArg("~"); got != "~" {
		t.Errorf("cdArg ~: %q", got)
	}
}

func TestRemoteScripts(t *testing.T) {
	sp := Spec{Cwd: "~/app", Env: map[string]string{"B": "2", "A": "it's"}}
	if got, want := sp.shellCmd(), `cd ~/'app' && export A='it'\''s' B='2' && exec "$SHELL" -l`; got != want {
		t.Errorf("shellCmd %q want %q", got, want)
	}
	if got, want := (Spec{}).shellCmd(), ""; got != want {
		t.Errorf("empty shellCmd %q", got)
	}
	if got, want := sp.tmuxCmd("abc"), `cd ~/'app' && tmux start-server \; if -F '#{e|<:#{history-limit},50000}' 'set -g history-limit 50000' \; new -A -s tdog-abc -e 'A=it'\''s' -e 'B=2' \; set -wq allow-passthrough on`; got != want {
		t.Errorf("tmuxCmd %q want %q", got, want)
	}
	oc := Spec{Cwd: "/x", Env: map[string]string{"K": "v"}, OnClose: hook("stop_on_fail", "a", "b")}
	if got, want := oc.remoteOnClose(), `cd '/x' && export K='v' && a && b`; got != want {
		t.Errorf("remoteOnClose %q want %q", got, want)
	}
}

func TestSpecRejectsBadEnvKey(t *testing.T) {
	r := config.Resolved{"env.A-B": {Value: "x", Origin: "terminal"}}
	if _, err := specFromResolved(r); err == nil {
		t.Fatal("bad env key accepted")
	}
}

func TestSpecFromResolved(t *testing.T) {
	r := config.Resolved{
		"target":     {Value: "ssh-host"},
		"cwd":        {Value: "/w"},
		"command":    {Value: "go test"},
		"persistent": {Value: true},
		"env.A":      {Value: "1"},
		"pre_exec":   {Value: map[string]any{"mode": "all", "run": []string{"x"}}},
		"on_close":   {Value: map[string]any{"mode": "stop_on_fail", "run": []string{"y", "z"}}},
	}
	sp, err := specFromResolved(r)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Target != "ssh-host" || sp.Cwd != "/w" || sp.Command != "go test" || !sp.Persistent ||
		sp.Env["A"] != "1" || sp.Pre.Run[0] != "x" || sp.OnClose.Mode != "stop_on_fail" || sp.Post != nil {
		t.Fatalf("%+v", sp)
	}
}

type presetRig struct {
	*rig
	store *config.Store
}

func newPresetRig(t *testing.T, presets map[string]string) *presetRig {
	t.Helper()
	base := newRig(t)
	store := config.NewStore(t.TempDir())
	for name, body := range presets {
		if err := store.Put(config.KindTerminal, name, []byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	base.srv.Close()
	srv := httptest.NewServer(NewHandler(Config{Shell: "/bin/sh", Audit: base.log, Registry: base.reg, Presets: store}))
	t.Cleanup(srv.Close)
	base.srv = srv
	return &presetRig{rig: base, store: store}
}

func (r *presetRig) auditFor(event string) (audit.Entry, bool) {
	for _, e := range r.log.Recent(100) {
		if e.Event == event {
			return e, true
		}
	}
	return audit.Entry{}, false
}

func (r *presetRig) waitAudit(event string) audit.Entry {
	r.t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if e, ok := r.auditFor(event); ok {
			return e
		}
		time.Sleep(20 * time.Millisecond)
	}
	r.t.Fatalf("no %q audit entry", event)
	return audit.Entry{}
}

func TestPresetLaunchTypesLine(t *testing.T) {
	dir, _ := filepath.EvalSymlinks(t.TempDir())
	r := newPresetRig(t, map[string]string{"app": `
cwd = "` + dir + `"
env = { TDOG_X = "hello" }
pre_exec = { mode = "stop_on_fail", run = ["echo $((20+22))"] }
command = "pwd; echo v=$TDOG_X"
post_exec = "echo $((6*7+1))"
`})
	c, _ := r.start("preset=app")
	out, _ := readUntil(t, r.ctx, c, "43")
	for _, want := range []string{"42", dir, "v=hello"} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in %q", want, out)
		}
	}
}

func TestPresetPaneOverride(t *testing.T) {
	r := newPresetRig(t, map[string]string{"app": `command = "echo base"`})
	c, _ := r.start("preset=app&override=" + url.QueryEscape(`command = "echo $((40+2))-over"`))
	if out, _ := readUntil(t, r.ctx, c, "42-over"); strings.Contains(out, "base-") {
		t.Fatalf("got %q", out)
	}
}

func TestPresetErrors(t *testing.T) {
	r := newPresetRig(t, map[string]string{"app": `command = "true"`})
	for _, q := range []string{"preset=missing", "preset=../x", "preset=app&override=" + url.QueryEscape("bogus = 1")} {
		if _, err := r.dial(q); err == nil {
			t.Errorf("%q: expected failure", q)
		}
	}
}

const onCloseTOML = `
env = { TDOG_X = "hello" }
on_close = { mode = "all", run = ["echo bye-$TDOG_X", "pwd"] }
`

func TestOnCloseRunsWhenShellExits(t *testing.T) {
	r := newPresetRig(t, map[string]string{"app": onCloseTOML})
	c, id := r.start("preset=app")
	send(t, r.ctx, c, frame.Input, "exit\n")
	e := r.waitAudit("on_close")
	if e.Session != id || !strings.Contains(e.Output, "bye-hello") {
		t.Fatalf("%+v", e)
	}
}

func TestOnCloseRunsWhenKilled(t *testing.T) {
	r := newPresetRig(t, map[string]string{"app": onCloseTOML})
	_, id := r.start("preset=app")
	if !r.reg.Kill(id) {
		t.Fatal("kill failed")
	}
	if e := r.waitAudit("on_close"); !strings.Contains(e.Output, "bye-hello") {
		t.Fatalf("%+v", e)
	}
}

func TestPresetOnCloseTimeoutIsAudited(t *testing.T) {
	old := onCloseTimeout
	onCloseTimeout = 200 * time.Millisecond
	t.Cleanup(func() { onCloseTimeout = old })
	r := newPresetRig(t, map[string]string{"app": `on_close = "sleep 5"`})
	_, id := r.start("preset=app")
	r.reg.Kill(id)
	if e := r.waitAudit("on_close"); e.Error == "" {
		t.Fatalf("expected timeout error: %+v", e)
	}
}

func TestOnCloseHookIsNotInterpolated(t *testing.T) {
	// The env value is data: it must reach the hook as a variable, never be parsed by a shell.
	marker := filepath.Join(t.TempDir(), "pwned")
	r := newPresetRig(t, map[string]string{"app": `
env = { EVIL = "$(touch ` + marker + `)" }
on_close = "echo \"$EVIL\""
`})
	_, id := r.start("preset=app")
	r.reg.Kill(id)
	e := r.waitAudit("on_close")
	if !strings.Contains(e.Output, "$(touch") {
		t.Fatalf("%+v", e)
	}
	if m, _ := filepath.Glob(marker); len(m) != 0 {
		t.Fatal("env value was executed")
	}
}

func TestDefaultTargetReadsGlobalConfig(t *testing.T) {
	if got := defaultTarget(nil); got != "" {
		t.Fatalf("nil store: %q", got)
	}
	dir := t.TempDir()
	s := config.NewStore(dir)
	if got := defaultTarget(s); got != "" {
		t.Fatalf("no config: %q", got)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte(`default_target = "ssh-host"`), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := defaultTarget(s); got != "ssh-host" {
		t.Fatalf("got %q", got)
	}
}
