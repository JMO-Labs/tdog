package config

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var (
	ErrBadName  = errors.New("invalid preset name")
	ErrBadKind  = errors.New("unknown preset kind")
	ErrNotFound = errors.New("preset not found")

	slug    = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)
	kindDir = map[string]string{KindTerminal: "terminals", KindScene: "scenes"}
)

// tmpFile is the slice of *os.File that Put uses; a seam for failure tests.
type tmpFile interface {
	Write([]byte) (int, error)
	Sync() error
	Close() error
	Name() string
}

var createTemp = func(dir, pattern string) (tmpFile, error) { return os.CreateTemp(dir, pattern) }

func validName(n string) bool { return slug.MatchString(n) }

// Store keeps config.toml and presets/{terminals,scenes}/*.toml under dir.
type Store struct{ dir string }

// NewStore returns a store rooted at dir ($TDOG_DATA).
func NewStore(dir string) *Store { return &Store{dir: dir} }

func (s *Store) path(kind, name string) (string, error) {
	d, ok := kindDir[kind]
	if !ok {
		return "", ErrBadKind
	}
	if !validName(name) {
		return "", ErrBadName
	}
	return filepath.Join(s.dir, "presets", d, name+".toml"), nil
}

// LoadGlobal reads config.toml; a missing file yields empty defaults.
func (s *Store) LoadGlobal() (*Global, error) {
	b, err := os.ReadFile(filepath.Join(s.dir, "config.toml"))
	if errors.Is(err, os.ErrNotExist) {
		return &Global{}, nil
	}
	if err != nil {
		return nil, err
	}
	v, err := Decode(KindGlobal, b)
	if err != nil {
		return nil, err
	}
	return v.(*Global), nil
}

// List returns the sorted preset names of kind.
func (s *Store) List(kind string) ([]string, error) {
	d, ok := kindDir[kind]
	if !ok {
		return nil, ErrBadKind
	}
	ents, err := os.ReadDir(filepath.Join(s.dir, "presets", d))
	if errors.Is(err, os.ErrNotExist) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	names := []string{}
	for _, e := range ents {
		if n, ok := strings.CutSuffix(e.Name(), ".toml"); ok && !e.IsDir() && validName(n) {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	return names, nil
}

// Get returns the raw TOML of a preset.
func (s *Store) Get(kind, name string) ([]byte, error) {
	p, err := s.path(kind, name)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	return b, err
}

// Put validates data, then writes it atomically (temp file + rename).
func (s *Store) Put(kind, name string, data []byte) error {
	p, err := s.path(kind, name)
	if err != nil {
		return err
	}
	if _, err := Decode(kind, data); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	f, err := createTemp(filepath.Dir(p), ".tmp-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(f.Name()) }() // no-op after a successful rename
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), p)
}

// Delete removes a preset.
func (s *Store) Delete(kind, name string) error {
	p, err := s.path(kind, name)
	if err != nil {
		return err
	}
	if err := os.Remove(p); errors.Is(err, os.ErrNotExist) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	return nil
}
