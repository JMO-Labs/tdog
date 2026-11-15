package fonts

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Getter downloads url, failing if the body exceeds max bytes. Tests mock it.
type Getter func(ctx context.Context, url string, max int64) ([]byte, error)

const (
	maxZip     = 300 << 20
	nerdBase   = "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/"
	googleAPI  = "https://api.github.com/repos/google/fonts/contents/ofl/"
	googleRaw  = "https://raw.githubusercontent.com/google/fonts/"
	maxInstall = 5 * time.Minute
)

var (
	nameRe     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$`)
	nerdKeep   = regexp.MustCompile(`NerdFont(Mono)?-(Regular|Bold|Italic|BoldItalic)\.(ttf|otf)$`)
	googleOK   = regexp.MustCompile(`(-(Regular|Bold|Italic|BoldItalic)|\[[a-z,A-Z]+\])\.ttf$`)
	httpClient = &http.Client{Timeout: maxInstall}
)

func httpGet(ctx context.Context, url string, max int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download: status %d", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > max {
		return nil, errors.New("download too large")
	}
	return b, nil
}

// installHandler decodes {"name": "..."} and runs install.
func (s *Store) installHandler(install func(context.Context, string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil || !nameRe.MatchString(req.Name) {
			jerr(w, http.StatusBadRequest, "invalid font name")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), maxInstall)
		defer cancel()
		switch err := install(ctx, req.Name); {
		case err == nil:
			w.WriteHeader(http.StatusNoContent)
		case errors.Is(err, ErrNotFound):
			jerr(w, http.StatusNotFound, "font not found (Google Fonts: OFL families only)")
		case errors.Is(err, errBad):
			jerr(w, http.StatusBadGateway, err.Error())
		default:
			jerr(w, http.StatusBadGateway, "download failed")
		}
	}
}

var errBad = errors.New("unusable download")

// installNerd downloads the Nerd Fonts release zip and keeps the Mono
// Regular/Bold/Italic/BoldItalic files (plain "Nerd Font" if there is no Mono).
func (s *Store) installNerd(ctx context.Context, name string) error {
	name = strings.ReplaceAll(name, " ", "")
	b, err := s.get(ctx, nerdBase+name+".zip", maxZip)
	if err != nil {
		return err
	}
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return fmt.Errorf("%w: not a zip", errBad)
	}
	pick := func(mono bool) (files []blob) {
		for _, zf := range zr.File {
			m := nerdKeep.FindStringSubmatch(zf.Name)
			if m == nil || (m[1] != "") != mono {
				continue
			}
			rc, err := zf.Open()
			if err != nil {
				continue
			}
			data, _ := io.ReadAll(io.LimitReader(rc, MaxUpload+1))
			rc.Close()
			if len(data) <= MaxUpload {
				files = append(files, blob{zf.Name, data})
			}
		}
		return files
	}
	family, files := name+" Nerd Font Mono", pick(true)
	if len(files) == 0 {
		family, files = name+" Nerd Font", pick(false)
	}
	if len(files) == 0 {
		return fmt.Errorf("%w: no Nerd Font files in archive", errBad)
	}
	if err := s.add(family, "nerd", files); err != nil {
		return fmt.Errorf("%w: %v", errBad, err)
	}
	return nil
}

// installGoogle fetches a family from the google/fonts repo's ofl/ directory,
// which only contains OFL-licensed families.
func (s *Store) installGoogle(ctx context.Context, name string) error {
	dir := strings.ToLower(strings.ReplaceAll(name, " ", ""))
	b, err := s.get(ctx, googleAPI+dir, 1<<20)
	if err != nil {
		return err
	}
	var items []struct {
		Name string `json:"name"`
		URL  string `json:"download_url"`
	}
	if json.Unmarshal(b, &items) != nil {
		return fmt.Errorf("%w: bad listing", errBad)
	}
	var files []blob
	for _, it := range items {
		if !googleOK.MatchString(it.Name) || strings.Contains(it.Name, "Italic[") || !strings.HasPrefix(it.URL, googleRaw) {
			continue
		}
		data, err := s.get(ctx, it.URL, MaxUpload)
		if err != nil {
			return err
		}
		files = append(files, blob{it.Name, data})
	}
	if len(files) == 0 {
		return fmt.Errorf("%w: no font files found", errBad)
	}
	if err := s.add(name, "google", files); err != nil {
		return fmt.Errorf("%w: %v", errBad, err)
	}
	return nil
}
