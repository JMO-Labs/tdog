package config

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func wantPath(t *testing.T, kind, body, path string) {
	t.Helper()
	_, err := Decode(kind, []byte(body))
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Path != path {
		t.Fatalf("%q: want path %q, got %v", body, path, err)
	}
}

func TestValidationErrorString(t *testing.T) {
	if got := (&ValidationError{Msg: "boom"}).Error(); got != "boom" {
		t.Fatalf("%q", got)
	}
	if got := (&ValidationError{Path: "a.b", Msg: "boom"}).Error(); got != "a.b: boom" {
		t.Fatalf("%q", got)
	}
}

func TestDecodeEdges(t *testing.T) {
	if _, err := Decode("nope", nil); !errors.Is(err, ErrBadKind) {
		t.Fatalf("%v", err)
	}
	// type mismatch is a decode error, not a parse error
	var ve *ValidationError
	if _, err := Decode(KindTerminal, []byte(`persistent = "yes"`)); !errors.As(err, &ve) {
		t.Fatalf("want ValidationError, got %v", err)
	}
}

func TestHookDecodeProblems(t *testing.T) {
	wantPath(t, KindTerminal, `pre_exec = 5`, "pre_exec")
	wantPath(t, KindTerminal, `pre_exec = { mode = 1, run = ["a"] }`, "pre_exec.mode")
	wantPath(t, KindTerminal, `pre_exec = { run = "a" }`, "pre_exec.run")
	wantPath(t, KindTerminal, `pre_exec = { run = ["a", 1] }`, "pre_exec.run")
	wantPath(t, KindTerminal, `pre_exec = { mode = "all", run = [] }`, "pre_exec.run")
	// missing mode defaults to "all"
	v, err := Decode(KindTerminal, []byte(`pre_exec = { run = ["a"] }`))
	if err != nil || v.(*Terminal).PreExec.Mode != "all" {
		t.Fatalf("%v %+v", err, v)
	}
}

func TestFieldValidation(t *testing.T) {
	wantPath(t, KindTerminal, `background = { kind = "gif" }`, "background.kind")
	wantPath(t, KindTerminal, `background = { blur = 101 }`, "background.blur")
	wantPath(t, KindTerminal, `env = { "A=B" = "x" }`, "env")
	wantPath(t, KindGlobal, `font = { size = 99 }`, "font.size")
	wantPath(t, KindScene, `background = { opacity = 3.0 }`, "background.opacity")
	wantPath(t, KindScene, "[[panes]]\n[panes.override]\ntarget = \"mars\"", "panes[0].override.target")
	if _, err := Decode(KindScene, []byte("[[panes]]\npreset = \"a\"\n[panes.override]\ntarget = \"container\"")); err != nil {
		t.Fatal(err)
	}
}

func TestStoreIOErrors(t *testing.T) {
	// data dir is a regular file: every path below it fails with ENOTDIR
	file := filepath.Join(t.TempDir(), "f")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	s := NewStore(file)
	if _, err := s.List(KindTerminal); err == nil || errors.Is(err, ErrNotFound) {
		t.Fatalf("list: %v", err)
	}
	if err := s.Put(KindTerminal, "a", []byte(`target = "container"`)); err == nil {
		t.Fatal("put under a file must fail")
	}

	// config.toml is a directory: read fails with something other than not-exist
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "config.toml"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(dir).LoadGlobal(); err == nil {
		t.Fatal("load global from a directory must fail")
	}

	// a non-empty directory squats on the preset path: remove fails
	dir = t.TempDir()
	sq := filepath.Join(dir, "presets", "terminals", "a.toml")
	if err := os.MkdirAll(filepath.Join(sq, "x"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := NewStore(dir).Delete(KindTerminal, "a"); err == nil || errors.Is(err, ErrNotFound) {
		t.Fatalf("delete: %v", err)
	}
}

type failFile struct {
	tmpFile
	write, sync, close bool
}

var errBoom = errors.New("boom")

func (f failFile) Write(b []byte) (int, error) {
	if f.write {
		return 0, errBoom
	}
	return f.tmpFile.Write(b)
}

func (f failFile) Sync() error {
	if f.sync {
		return errBoom
	}
	return f.tmpFile.Sync()
}

func (f failFile) Close() error {
	err := f.tmpFile.Close()
	if f.close {
		return errBoom
	}
	return err
}

func TestPutTempFileFailures(t *testing.T) {
	orig := createTemp
	t.Cleanup(func() { createTemp = orig })
	body := []byte(`target = "container"`)

	createTemp = func(string, string) (tmpFile, error) { return nil, errBoom }
	dir := t.TempDir()
	if err := NewStore(dir).Put(KindTerminal, "a", body); !errors.Is(err, errBoom) {
		t.Fatalf("create: %v", err)
	}

	for name, ff := range map[string]failFile{
		"write": {write: true},
		"sync":  {sync: true},
		"close": {close: true},
	} {
		ff := ff
		createTemp = func(d, p string) (tmpFile, error) {
			f, err := orig(d, p)
			ff.tmpFile = f
			return ff, err
		}
		dir := t.TempDir()
		s := NewStore(dir)
		if err := s.Put(KindTerminal, "a", body); !errors.Is(err, errBoom) {
			t.Fatalf("%s: %v", name, err)
		}
		if _, err := s.Get(KindTerminal, "a"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("%s: preset must not exist: %v", name, err)
		}
		if ents, _ := os.ReadDir(filepath.Join(dir, "presets", "terminals")); len(ents) != 0 {
			t.Fatalf("%s: temp file left behind: %v", name, ents)
		}
	}
}

func TestRouteInternalError(t *testing.T) {
	file := filepath.Join(t.TempDir(), "f")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	NewStore(file).Register(mux)
	w := call(mux, "GET", "/api/presets/terminal", "")
	if w.Code != http.StatusInternalServerError || w.Body.String() == "" {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if got := w.Body.String(); got != "{\"error\":\"internal error\"}\n" {
		t.Fatalf("must not leak the cause: %q", got)
	}
}
