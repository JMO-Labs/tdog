package main

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestRunServesWithDefaultAddr(t *testing.T) {
	var gotAddr string
	var gotH http.Handler
	err := run(env(map[string]string{"TDOG_DATA": t.TempDir()}), func(a string, h http.Handler) error {
		gotAddr, gotH = a, h
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotAddr != ":7681" || gotH == nil {
		t.Fatalf("addr=%q handler=%v", gotAddr, gotH)
	}
}

func TestRunCustomAddrAndServeError(t *testing.T) {
	want := errors.New("boom")
	var gotAddr string
	err := run(env(map[string]string{"TDOG_ADDR": "127.0.0.1:1", "TDOG_DATA": t.TempDir()}), func(a string, _ http.Handler) error {
		gotAddr = a
		return want
	})
	if !errors.Is(err, want) || gotAddr != "127.0.0.1:1" {
		t.Fatalf("err=%v addr=%q", err, gotAddr)
	}
}

func TestRunAuthInitError(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "auth.json"), []byte("{bad"), 0o600); err != nil {
		t.Fatal(err)
	}
	called := false
	err := run(env(map[string]string{"TDOG_DATA": dir}), func(string, http.Handler) error { called = true; return nil })
	if err == nil || called {
		t.Fatalf("err=%v called=%v", err, called)
	}
}
