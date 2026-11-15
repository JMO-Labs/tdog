// Package plugins implements the plugin system (ADR-0005).
package plugins

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Manifest is a plugin's metadata from tdog-plugin.json.
type Manifest struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Version     string    `json:"version"`
	Author      string    `json:"author"`
	Description string    `json:"description"`
	Entry       string    `json:"entry"`
	Permissions []string  `json:"permissions"`
	Commands    []Command `json:"commands,omitempty"`
}

// Command is one plugin command.
type Command struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

var (
	idRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,40}$`)
	// hostRe matches a hostname label (no wildcards, IPs, or ports per ADR-0005)
	// Each label can contain a-z, 0-9, and hyphens (not at start/end)
	labelRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$`)
)

var validPerms = map[string]bool{
	"screen:read": true, "input:observe": true, "input:gate": true,
	"input:insert": true, "overlay": true, "ai": true,
}

// Validate checks the manifest for correctness.
func (m *Manifest) Validate() error {
	if !idRe.MatchString(m.ID) {
		return fmt.Errorf("invalid id %q", m.ID)
	}
	if m.Name == "" {
		return errors.New("name required")
	}
	if !isSemVer(m.Version) {
		return fmt.Errorf("invalid version %q", m.Version)
	}
	if m.Author == "" {
		return errors.New("author required")
	}
	if m.Description == "" {
		return errors.New("description required")
	}
	if m.Entry == "" {
		return errors.New("entry required")
	}
	if m.Entry != cleanPath(m.Entry) || m.Entry == ".js" {
		return fmt.Errorf("invalid entry %q", m.Entry)
	}
	if err := m.validatePerms(); err != nil {
		return err
	}
	if err := m.validateCommands(); err != nil {
		return err
	}
	return nil
}

func (m *Manifest) validatePerms() error {
	if m.Permissions == nil {
		m.Permissions = []string{}
	}
	seen := make(map[string]bool)
	for _, p := range m.Permissions {
		if seen[p] {
			return fmt.Errorf("duplicate permission %q", p)
		}
		seen[p] = true
		if !validPerms[p] && !isNetHost(p) {
			return fmt.Errorf("invalid permission %q", p)
		}
	}
	return nil
}

func isNetHost(p string) bool {
	if len(p) < 5 || p[:4] != "net:" {
		return false
	}
	host := p[4:]
	// Validate hostname: must be lowercase letters, digits, dots, hyphens
	// No IPs (all-digit labels), no ports, no wildcards
	if host == "" {
		return false
	}
	labels := strings.Split(host, ".")
	if len(labels) == 0 {
		return false
	}
	for _, label := range labels {
		if !labelRe.MatchString(label) {
			return false
		}
		// Reject all-numeric labels (IPs)
		allDigit := true
		for _, ch := range label {
			if ch < '0' || ch > '9' {
				allDigit = false
				break
			}
		}
		if allDigit {
			return false
		}
	}
	return true
}

func (m *Manifest) validateCommands() error {
	if m.Commands == nil {
		m.Commands = []Command{}
	}
	seen := make(map[string]bool)
	for _, c := range m.Commands {
		if c.ID == "" || c.Title == "" {
			return errors.New("command id and title required")
		}
		if seen[c.ID] {
			return fmt.Errorf("duplicate command %q", c.ID)
		}
		seen[c.ID] = true
	}
	return nil
}

func isSemVer(v string) bool {
	if len(v) == 0 {
		return false
	}
	// simple check: X.Y.Z[-prerelease][+build]
	parts := regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$`)
	return parts.MatchString(v)
}

// cleanPath removes any path separators and leading dots.
func cleanPath(s string) string {
	s = regexp.MustCompile(`[/\\]`).ReplaceAllString(s, "")
	if len(s) > 0 && s[0] == '.' {
		s = s[1:]
	}
	return s
}

// ParseManifest unmarshals raw JSON and validates it strictly
// (unknown keys rejected).
func ParseManifest(raw []byte) (*Manifest, error) {
	var m Manifest
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&m); err != nil {
		return nil, fmt.Errorf("invalid manifest: %w", err)
	}
	if err := m.Validate(); err != nil {
		return nil, err
	}
	return &m, nil
}

// PermEqual reports whether two permission slices are equal (sorted).
func PermEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	sa := make([]string, len(a))
	sb := make([]string, len(b))
	copy(sa, a)
	copy(sb, b)
	sort.Strings(sa)
	sort.Strings(sb)
	for i := range sa {
		if sa[i] != sb[i] {
			return false
		}
	}
	return true
}
