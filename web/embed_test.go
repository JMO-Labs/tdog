package web

import (
	"errors"
	"io/fs"
	"testing"
)

func TestFSServesDistRoot(t *testing.T) {
	if _, err := fs.Stat(FS(), ".gitkeep"); err != nil {
		t.Fatalf("expected .gitkeep at FS root: %v", err)
	}
}

func TestFSFallsBackToRawEmbedWhenSubFails(t *testing.T) {
	orig := subFS
	subFS = func(fs.FS, string) (fs.FS, error) { return nil, errors.New("boom") }
	defer func() { subFS = orig }()

	if _, err := fs.Stat(FS(), "dist/.gitkeep"); err != nil {
		t.Fatalf("expected raw embed fallback: %v", err)
	}
}
