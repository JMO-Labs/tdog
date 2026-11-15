// Package fonts is the server-side font store (spec §8): uploaded and
// downloaded fonts live under $TDOG_DATA/fonts and are served as @font-face
// rules so every client renders the same glyphs. Routes sit behind auth.
package fonts

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

// MaxUpload caps one font file (upload or extracted from an archive).
const MaxUpload = 20 << 20

var (
	// ErrNotFound is returned by a Getter when the remote has no such resource.
	ErrNotFound = errors.New("fonts: not found")
	famRe       = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,63}$`)
	weights     = map[string]string{
		"Thin": "100", "ExtraLight": "200", "Light": "300", "Regular": "400", "Medium": "500",
		"SemiBold": "600", "Bold": "700", "ExtraBold": "800", "Black": "900",
	}
	formats = map[string][2]string{
		".ttf": {"truetype", "font/ttf"}, ".otf": {"opentype", "font/otf"}, ".woff2": {"woff2", "font/woff2"},
	}
)

// Entry is one installed font file.
type Entry struct {
	Family string `json:"family"`
	Style  string `json:"style"`
	Weight string `json:"weight"`
	Italic bool   `json:"italic"`
	File   string `json:"file"`
	Source string `json:"source"` // upload | nerd | google
}

// Family groups the styles installed for one family.
type Family struct {
	Family string   `json:"family"`
	Source string   `json:"source"`
	Styles []string `json:"styles"`
}

// Store keeps font files and manifest.json under dir/fonts.
type Store struct {
	dir string
	get Getter
	mu  sync.Mutex
}

// New returns a store rooted at the data dir. get fetches remote resources;
// nil uses HTTPS.
func New(dataDir string, get Getter) *Store {
	if get == nil {
		get = httpGet
	}
	return &Store{dir: filepath.Join(dataDir, "fonts"), get: get}
}

func (s *Store) load() []Entry {
	var es []Entry
	if b, err := os.ReadFile(filepath.Join(s.dir, "manifest.json")); err == nil {
		_ = json.Unmarshal(b, &es)
	}
	return es
}

func (s *Store) save(es []Entry) error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return err
	}
	b, _ := json.Marshal(es)
	tmp := filepath.Join(s.dir, "manifest.json.tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(s.dir, "manifest.json"))
}

// sniff checks the file header against the extension and returns the extension.
func sniff(name string, b []byte) (string, error) {
	ext := strings.ToLower(filepath.Ext(name))
	if _, ok := formats[ext]; !ok {
		return "", fmt.Errorf("unsupported file type %q (want .ttf, .otf or .woff2)", ext)
	}
	if len(b) < 12 {
		return "", errors.New("file too small to be a font")
	}
	h := string(b[:4])
	ok := false
	switch ext {
	case ".ttf":
		ok = h == "\x00\x01\x00\x00" || h == "true"
	case ".otf":
		ok = h == "OTTO" || h == "\x00\x01\x00\x00"
	case ".woff2":
		ok = h == "wOF2"
	}
	if !ok {
		return "", fmt.Errorf("file header does not match %s", ext)
	}
	return ext, nil
}

// styleOf derives style, CSS weight and italic from a file name like
// "Fira-BoldItalic.ttf" or "Name[wght].ttf" (variable).
func styleOf(name string) (style, weight string, italic bool) {
	base := strings.TrimSuffix(name, filepath.Ext(name))
	if strings.Contains(base, "[") {
		return "Variable", "100 900", false
	}
	style = "Regular"
	if i := strings.LastIndex(base, "-"); i >= 0 && i < len(base)-1 {
		style = base[i+1:]
	}
	if style == "Italic" || strings.HasSuffix(style, "Italic") {
		italic = true
		style = strings.TrimSuffix(style, "Italic")
	}
	w, ok := weights[style]
	if !ok {
		w = "400"
	}
	if style == "" {
		style, w = "Regular", "400"
	}
	if italic {
		style += "Italic"
		if style == "RegularItalic" {
			style = "Italic"
		}
	}
	return style, w, italic
}

func fileSlug(s string) string {
	return strings.Trim(regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(strings.ToLower(s), "-"), "-")
}

type blob struct {
	name string
	data []byte
}

// add validates and stores files for family, replacing same family+style.
func (s *Store) add(family, source string, files []blob) error {
	if !famRe.MatchString(family) {
		return errors.New("invalid family name")
	}
	type item struct {
		e    Entry
		data []byte
	}
	var items []item
	for _, f := range files {
		ext, err := sniff(f.name, f.data)
		if err != nil {
			return err
		}
		st, w, it := styleOf(f.name)
		items = append(items, item{Entry{family, st, w, it, fileSlug(family) + "-" + fileSlug(st) + ext, source}, f.data})
	}
	if len(items) == 0 {
		return errors.New("no usable font files")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return err
	}
	es := s.load()
	for _, it := range items {
		for _, e := range es {
			if e.File == it.e.File && e.Family != it.e.Family {
				return fmt.Errorf("file name clashes with installed family %q", e.Family)
			}
		}
	}
	for _, it := range items {
		if err := os.WriteFile(filepath.Join(s.dir, it.e.File), it.data, 0o600); err != nil {
			return err
		}
		kept := es[:0]
		for _, e := range es {
			if e.Family != it.e.Family || e.Style != it.e.Style {
				kept = append(kept, e)
			} else if e.File != it.e.File {
				_ = os.Remove(filepath.Join(s.dir, e.File))
			}
		}
		es = append(kept, it.e)
	}
	return s.save(es)
}

// List returns installed fonts grouped by family.
func (s *Store) List() []Family {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []Family{}
	idx := map[string]int{}
	for _, e := range s.load() {
		i, ok := idx[e.Family]
		if !ok {
			i = len(out)
			idx[e.Family] = i
			out = append(out, Family{Family: e.Family, Source: e.Source})
		}
		out[i].Styles = append(out[i].Styles, e.Style)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Family < out[j].Family })
	return out
}

// Delete removes a family and its files; false when it is not installed.
func (s *Store) Delete(family string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var kept []Entry
	found := false
	for _, e := range s.load() {
		if e.Family == family {
			found = true
			_ = os.Remove(filepath.Join(s.dir, e.File))
		} else {
			kept = append(kept, e)
		}
	}
	if !found {
		return false, nil
	}
	return true, s.save(kept)
}

// CSS renders @font-face rules for every installed font.
func (s *Store) CSS() string {
	s.mu.Lock()
	es := s.load()
	s.mu.Unlock()
	var b bytes.Buffer
	for _, e := range es {
		ext := filepath.Ext(e.File)
		style := "normal"
		if e.Italic {
			style = "italic"
		}
		fmt.Fprintf(&b, "@font-face {\n  font-family: %q;\n  font-style: %s;\n  font-weight: %s;\n  font-display: swap;\n  src: url(%q) format(%q);\n}\n",
			e.Family, style, e.Weight, "/api/fonts/files/"+e.File, formats[ext][0])
	}
	return b.String()
}

func (s *Store) file(name string) (string, string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.load() {
		if e.File == name {
			return filepath.Join(s.dir, e.File), formats[filepath.Ext(e.File)][1], true
		}
	}
	return "", "", false
}

func jerr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// Register mounts the font routes; they must sit behind the auth middleware.
func (s *Store) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/fonts", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(s.List())
	})
	mux.HandleFunc("GET /api/fonts.css", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = io.WriteString(w, s.CSS())
	})
	mux.HandleFunc("GET /api/fonts/files/{file}", func(w http.ResponseWriter, r *http.Request) {
		p, ct, ok := s.file(r.PathValue("file"))
		if !ok {
			jerr(w, http.StatusNotFound, "no such font file")
			return
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, max-age=3600")
		http.ServeFile(w, r, p)
	})
	mux.HandleFunc("POST /api/fonts", s.upload)
	mux.HandleFunc("DELETE /api/fonts/{family}", func(w http.ResponseWriter, r *http.Request) {
		ok, err := s.Delete(r.PathValue("family"))
		switch {
		case err != nil:
			jerr(w, http.StatusInternalServerError, "could not delete font")
		case !ok:
			jerr(w, http.StatusNotFound, "font not installed")
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})
	mux.HandleFunc("POST /api/fonts/nerd", s.installHandler(s.installNerd))
	mux.HandleFunc("POST /api/fonts/google", s.installHandler(s.installGoogle))
}

func (s *Store) upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, MaxUpload+1<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var mb *http.MaxBytesError
		if errors.As(err, &mb) {
			jerr(w, http.StatusRequestEntityTooLarge, "font too large (20 MB max)")
			return
		}
		jerr(w, http.StatusBadRequest, "expected multipart form with a file field")
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		jerr(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer func() { _ = f.Close() }()
	data, err := io.ReadAll(io.LimitReader(f, MaxUpload+1))
	if err != nil || len(data) > MaxUpload {
		jerr(w, http.StatusRequestEntityTooLarge, "font too large (20 MB max)")
		return
	}
	name := filepath.Base(hdr.Filename)
	family := r.FormValue("family")
	if family == "" {
		family = strings.TrimSuffix(name, filepath.Ext(name))
		if i := strings.LastIndex(family, "-"); i > 0 {
			family = family[:i]
		}
	}
	if err := s.add(family, "upload", []blob{{name, data}}); err != nil {
		jerr(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
