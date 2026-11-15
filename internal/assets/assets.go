// Package assets is the shared background asset store under $TDOG_DATA/assets.
// Files are stored by random id; client filenames are never used as paths.
package assets

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	_ "image/gif" // register decoders for DecodeConfig
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const defaultMax = 50 << 20

var (
	errTooLarge = errors.New("asset too large")
	errType     = errors.New("unsupported content type")
	idRe        = regexp.MustCompile(`^[0-9a-f]{32}$`)
	types       = map[string]string{
		"image/png": "image", "image/jpeg": "image", "image/webp": "image", "image/gif": "image",
		"video/webm": "video", "video/mp4": "video",
	}
)

// Asset is the metadata returned by the API.
type Asset struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"` // image | video
	Type   string `json:"type"` // sniffed MIME type
	Size   int64  `json:"size"`
	Width  int    `json:"width,omitempty"`
	Height int    `json:"height,omitempty"`
}

// Store keeps assets as <id>.bin plus <id>.json metadata.
type Store struct {
	dir     string
	maxSize int64
	allowIP func(net.IP) bool // test hook; nil means publicIP
}

// New returns a store rooted at dataDir/assets.
func New(dataDir string) *Store {
	return &Store{dir: filepath.Join(dataDir, "assets"), maxSize: defaultMax}
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// rename is a seam for tests.
var rename = os.Rename

// ingest copies r into the store after size and content sniffing.
func (s *Store) ingest(r io.Reader) (Asset, error) {
	var a Asset
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return a, err
	}
	tmp, err := os.CreateTemp(s.dir, ".upload-*")
	if err != nil {
		return a, err
	}
	defer func() { _ = os.Remove(tmp.Name()) }() // no-op after successful rename
	n, err := io.Copy(tmp, io.LimitReader(r, s.maxSize+1))
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return a, err
	}
	if n > s.maxSize {
		return a, errTooLarge
	}
	f, err := os.Open(tmp.Name())
	if err != nil {
		return a, err
	}
	head := make([]byte, 512)
	hn, _ := io.ReadFull(f, head)
	mt := strings.SplitN(http.DetectContentType(head[:hn]), ";", 2)[0]
	kind, ok := types[mt]
	if !ok {
		_ = f.Close()
		return a, errType
	}
	a = Asset{ID: newID(), Kind: kind, Type: mt, Size: n}
	if mt != "image/webp" && kind == "image" {
		_, _ = f.Seek(0, io.SeekStart)
		if c, _, err := image.DecodeConfig(f); err == nil {
			a.Width, a.Height = c.Width, c.Height
		}
	}
	_ = f.Close()
	meta, _ := json.Marshal(a)
	if err := os.WriteFile(filepath.Join(s.dir, a.ID+".json"), meta, 0o600); err != nil {
		return Asset{}, err
	}
	if err := rename(tmp.Name(), filepath.Join(s.dir, a.ID+".bin")); err != nil {
		_ = os.Remove(filepath.Join(s.dir, a.ID+".json"))
		return Asset{}, err
	}
	return a, nil
}

// Get returns metadata for id.
func (s *Store) Get(id string) (Asset, error) {
	var a Asset
	if !idRe.MatchString(id) {
		return a, os.ErrNotExist
	}
	b, err := os.ReadFile(filepath.Join(s.dir, id+".json"))
	if err != nil {
		return a, err
	}
	return a, json.Unmarshal(b, &a)
}

// List returns all assets, sorted by id.
func (s *Store) List() ([]Asset, error) {
	ents, err := os.ReadDir(s.dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	out := []Asset{}
	for _, e := range ents {
		id, ok := strings.CutSuffix(e.Name(), ".json")
		if !ok {
			continue
		}
		if a, err := s.Get(id); err == nil {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// Delete removes an asset.
func (s *Store) Delete(id string) error {
	if !idRe.MatchString(id) {
		return os.ErrNotExist
	}
	if err := os.Remove(filepath.Join(s.dir, id+".json")); err != nil {
		return err
	}
	return os.Remove(filepath.Join(s.dir, id+".bin"))
}
