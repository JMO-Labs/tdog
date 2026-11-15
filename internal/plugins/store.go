package plugins

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// randToken returns a random hex string of n bytes.
func randToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// PluginInfo is the public-facing plugin metadata.
type PluginInfo struct {
	ID          string   `json:"id"`
	Version     string   `json:"version"`
	Enabled     bool     `json:"enabled"`
	Permissions []string `json:"permissions"`
	SHA256      string   `json:"sha256"`
}

// installState tracks a plugin's installation and permissions.
type installState struct {
	Manifest    *Manifest `json:"manifest"`
	Permissions []string  `json:"permissions"`
	Enabled     bool      `json:"enabled"`
	SHA256      string    `json:"sha256"`
}

// Store manages plugins under $TDOG_DATA/plugins.
type Store struct {
	dir      string
	stagedMu sync.Mutex
	staged   map[string]*stagedBundle
	now      func() time.Time
}

// New returns a store rooted at dataDir/plugins.
func New(dataDir string) *Store {
	return &Store{
		dir:    filepath.Join(dataDir, "plugins"),
		staged: make(map[string]*stagedBundle),
		now:    time.Now,
	}
}

const maxZipSize = 2 << 20 // 2 MB uncompressed
const maxZipEntries = 20
const maxStagedBundles = 20
const stagedTTL = 10 * time.Minute

var errBadZip = errors.New("invalid zip archive")

// StagedManifest is returned by Inspect.
type StagedManifest struct {
	Manifest *Manifest `json:"manifest"`
	SHA256   string    `json:"sha256"`
	Token    string    `json:"token"`
}

type stagedBundle struct {
	manifest  *Manifest
	sha256    string
	jsContent []byte
	created   time.Time
}

// Inspect parses a manifest and JS from raw bytes (zip or individual files).
// Returns a token for staged installation; caller must call Install with this token.
func (s *Store) Inspect(raw []byte) (*StagedManifest, string, error) {
	var manifest *Manifest
	var jsContent []byte

	h := sha256.Sum256(raw)
	checksum := hex.EncodeToString(h[:])

	// Try zip first
	r := bytes.NewReader(raw)
	if zr, err := zip.NewReader(r, int64(len(raw))); err == nil {
		manifest, jsContent, err = extractFromZip(zr)
		if err != nil {
			return nil, "", fmt.Errorf("zip extract: %w", err)
		}
	} else {
		// Try bare files: call expects either both manifest.json and entry.js,
		// or multipart upload handling (done in HTTP layer)
		return nil, "", errors.New("multipart expected; use POST /api/plugins/inspect with file upload")
	}

	if manifest == nil || len(jsContent) == 0 {
		return nil, "", errors.New("manifest and entry.js required")
	}

	s.stagedMu.Lock()
	defer s.stagedMu.Unlock()

	// Sweep expired entries and check capacity
	now := s.now()
	for token, bundle := range s.staged {
		if now.Sub(bundle.created) > stagedTTL {
			delete(s.staged, token)
		}
	}
	if len(s.staged) >= maxStagedBundles {
		return nil, "", errors.New("too many staged bundles; try again later")
	}

	token := randToken(32)
	s.staged[token] = &stagedBundle{
		manifest:  manifest,
		sha256:    checksum,
		jsContent: jsContent,
		created:   now,
	}

	return &StagedManifest{
		Manifest: manifest,
		SHA256:   checksum,
		Token:    token,
	}, token, nil
}

// extractFromZip reads manifest and entry from a zip; enforces zip safety rules.
func extractFromZip(zr *zip.Reader) (*Manifest, []byte, error) {
	if len(zr.File) > maxZipEntries {
		return nil, nil, fmt.Errorf("%w: too many entries", errBadZip)
	}

	var manifest *Manifest
	var jsContent []byte
	var manifestName string
	totalUncompressed := int64(0)

	for _, f := range zr.File {
		// Zip safety: no dirs, no symlinks, no nested dirs, no zip slip
		if f.FileInfo().IsDir() {
			return nil, nil, fmt.Errorf("%w: directory entry", errBadZip)
		}
		if (f.ExternalAttrs & 0o170000) == 0o120000 {
			return nil, nil, fmt.Errorf("%w: symlink", errBadZip)
		}
		if strings.Contains(f.Name, "/") {
			return nil, nil, fmt.Errorf("%w: nested path", errBadZip)
		}
		if strings.Contains(f.Name, "\\") {
			return nil, nil, fmt.Errorf("%w: backslash in name", errBadZip)
		}
		if strings.HasPrefix(f.Name, "..") {
			return nil, nil, fmt.Errorf("%w: zip slip", errBadZip)
		}

		totalUncompressed += int64(f.UncompressedSize64)
		if totalUncompressed > maxZipSize {
			return nil, nil, fmt.Errorf("%w: too large", errBadZip)
		}

		if strings.HasSuffix(f.Name, ".json") && strings.HasPrefix(f.Name, "tdog-plugin") {
			manifestName = f.Name
		}
	}

	// Extract manifest
	for _, f := range zr.File {
		if f.Name == manifestName {
			rc, err := f.Open()
			if err != nil {
				return nil, nil, fmt.Errorf("open manifest: %w", err)
			}
			defer func() { _ = rc.Close() }()
			b, err := io.ReadAll(io.LimitReader(rc, 1<<20))
			if err != nil {
				return nil, nil, fmt.Errorf("read manifest: %w", err)
			}
			m, err := ParseManifest(b)
			if err != nil {
				return nil, nil, err
			}
			manifest = m
		}
	}

	// Extract entry.js
	if manifest != nil {
		for _, f := range zr.File {
			if f.Name == manifest.Entry {
				rc, err := f.Open()
				if err != nil {
					return nil, nil, fmt.Errorf("open entry: %w", err)
				}
				defer func() { _ = rc.Close() }()
				b, err := io.ReadAll(io.LimitReader(rc, 1<<20))
				if err != nil {
					return nil, nil, fmt.Errorf("read entry: %w", err)
				}
				jsContent = b
			}
		}
	}

	if manifest == nil {
		return nil, nil, errors.New("manifest not found in zip")
	}
	if jsContent == nil {
		return nil, nil, fmt.Errorf("entry %q not found in zip", manifest.Entry)
	}

	return manifest, jsContent, nil
}

// Install stores a plugin from a staged bundle.
// grant must match manifest.Permissions exactly.
// For updates, grant may be fewer or equal permissions; more requires re-approval.
func (s *Store) Install(token string, grant []string) error {
	s.stagedMu.Lock()
	sb, ok := s.staged[token]
	if !ok {
		s.stagedMu.Unlock()
		return errors.New("invalid or expired token")
	}
	// Check TTL
	if s.now().Sub(sb.created) > stagedTTL {
		delete(s.staged, token)
		s.stagedMu.Unlock()
		return errors.New("token expired")
	}
	delete(s.staged, token)
	s.stagedMu.Unlock()

	if !PermEqual(grant, sb.manifest.Permissions) {
		return errors.New("granted permissions do not match manifest")
	}

	id := sb.manifest.ID
	pluginDir := filepath.Join(s.dir, id)

	// Check for update: if exists, verify permission growth is denied
	if old, err := s.get(id); err == nil && old != nil {
		oldPerms := old.Permissions
		for _, p := range grant {
			found := false
			for _, op := range oldPerms {
				if p == op {
					found = true
					break
				}
			}
			if !found {
				// New permission: not allowed without re-approval; should be rejected in HTTP layer
				return errors.New("permission increase requires re-approval")
			}
		}
	}

	if err := os.MkdirAll(pluginDir, 0o700); err != nil {
		return err
	}

	// Write entry.js
	if err := os.WriteFile(filepath.Join(pluginDir, sb.manifest.Entry),
		sb.jsContent, 0o600); err != nil {
		return err
	}

	// Write manifest.json
	manifestPath := filepath.Join(pluginDir, "tdog-plugin.json")
	manifestBytes, _ := json.Marshal(sb.manifest)
	if err := os.WriteFile(manifestPath, manifestBytes, 0o600); err != nil {
		_ = os.Remove(filepath.Join(pluginDir, sb.manifest.Entry))
		return err
	}

	// Write state.json
	state := installState{
		Manifest:    sb.manifest,
		Permissions: grant,
		Enabled:     true,
		SHA256:      sb.sha256,
	}
	stateBytes, _ := json.Marshal(state)
	if err := os.WriteFile(filepath.Join(pluginDir, "state.json"),
		stateBytes, 0o600); err != nil {
		_ = os.Remove(manifestPath)
		_ = os.Remove(filepath.Join(pluginDir, sb.manifest.Entry))
		return err
	}

	return nil
}

// List returns all installed plugins with their public info.
func (s *Store) List() ([]PluginInfo, error) {
	ents, err := os.ReadDir(s.dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	var out []PluginInfo
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		info, err := s.get(e.Name())
		if err == nil && info != nil {
			out = append(out, *info)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// get reads a plugin's state; returns nil if not found.
func (s *Store) get(id string) (*PluginInfo, error) {
	stateFile := filepath.Join(s.dir, id, "state.json")
	b, err := os.ReadFile(stateFile)
	if err != nil {
		return nil, err
	}
	var state installState
	if err := json.Unmarshal(b, &state); err != nil {
		return nil, err
	}
	return &PluginInfo{
		ID:          id,
		Version:     state.Manifest.Version,
		Enabled:     state.Enabled,
		Permissions: state.Permissions,
		SHA256:      state.SHA256,
	}, nil
}

// SetEnabled toggles a plugin's enabled flag.
func (s *Store) SetEnabled(id string, enabled bool) error {
	stateFile := filepath.Join(s.dir, id, "state.json")
	b, err := os.ReadFile(stateFile)
	if err != nil {
		return err
	}
	var state installState
	if err := json.Unmarshal(b, &state); err != nil {
		return err
	}
	state.Enabled = enabled
	newB, _ := json.Marshal(state)
	return os.WriteFile(stateFile, newB, 0o600)
}

// Delete removes a plugin.
func (s *Store) Delete(id string) error {
	return os.RemoveAll(filepath.Join(s.dir, id))
}

// GetEntry reads the entry.js content for a plugin.
func (s *Store) GetEntry(id string) ([]byte, error) {
	info, err := s.get(id)
	if err != nil {
		return nil, err
	}

	// Read manifest to get entry filename
	manifestFile := filepath.Join(s.dir, id, "tdog-plugin.json")
	b, err := os.ReadFile(manifestFile)
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}

	if !info.Enabled {
		return nil, errors.New("plugin not enabled")
	}

	return os.ReadFile(filepath.Join(s.dir, id, m.Entry))
}
