package assets

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

const fetchTimeout = 30 * time.Second

var errBlocked = errors.New("target address not allowed")

// Register mounts the asset routes; they must sit behind the auth middleware.
func (s *Store) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/assets", s.upload)
	mux.HandleFunc("POST /api/assets/url", s.fromURL)
	mux.HandleFunc("GET /api/assets", func(w http.ResponseWriter, _ *http.Request) {
		list, err := s.List()
		if err != nil {
			jerr(w, 500, "list failed")
			return
		}
		writeJSON(w, 200, list)
	})
	mux.HandleFunc("GET /api/assets/{id}", s.serve)
	mux.HandleFunc("DELETE /api/assets/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := s.Delete(r.PathValue("id")); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				jerr(w, 404, "not found")
			} else {
				jerr(w, 500, "delete failed")
			}
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func jerr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// ingestErr maps an ingest failure to a response.
func ingestErr(w http.ResponseWriter, err error) {
	var mb *http.MaxBytesError
	switch {
	case errors.Is(err, errTooLarge), errors.As(err, &mb):
		jerr(w, 413, "asset too large")
	case errors.Is(err, errType):
		jerr(w, 415, "unsupported content type")
	default:
		jerr(w, 500, "store failed")
	}
}

func (s *Store) upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, s.maxSize+(1<<20))
	mr, err := r.MultipartReader()
	if err != nil {
		jerr(w, 400, "multipart body required")
		return
	}
	for {
		p, err := mr.NextPart()
		if err != nil {
			var mb *http.MaxBytesError
			if errors.As(err, &mb) {
				ingestErr(w, err)
			} else {
				jerr(w, 400, "missing file field")
			}
			return
		}
		if p.FormName() != "file" {
			continue
		}
		a, err := s.ingest(p)
		if err != nil {
			ingestErr(w, err)
			return
		}
		writeJSON(w, 201, a)
		return
	}
}

func (s *Store) fromURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		jerr(w, 400, "invalid json")
		return
	}
	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		jerr(w, 400, "http(s) url required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), fetchTimeout)
	defer cancel()
	hr, _ := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	resp, err := s.client().Do(hr)
	if err != nil {
		if errors.Is(err, errBlocked) {
			jerr(w, 403, "target address not allowed")
		} else {
			jerr(w, 502, "download failed")
		}
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		jerr(w, 502, fmt.Sprintf("remote returned %d", resp.StatusCode))
		return
	}
	a, err := s.ingest(resp.Body)
	if err != nil {
		if errors.Is(err, errTooLarge) || errors.Is(err, errType) {
			ingestErr(w, err)
		} else {
			jerr(w, 502, "download failed")
		}
		return
	}
	writeJSON(w, 201, a)
}

// client dials only addresses that pass the policy; the check runs on the
// resolved IP of every connection, so redirects and DNS tricks are covered.
func (s *Store) client() *http.Client {
	allow := s.allowIP
	if allow == nil {
		allow = publicIP
	}
	d := &net.Dialer{Timeout: 10 * time.Second, Control: func(_, addr string, _ syscall.RawConn) error {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return errBlocked
		}
		if ip := net.ParseIP(host); ip == nil || !allow(ip) {
			return errBlocked
		}
		return nil
	}}
	return &http.Client{
		Timeout:   fetchTimeout,
		Transport: &http.Transport{DialContext: d.DialContext, Proxy: nil},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 || (req.URL.Scheme != "http" && req.URL.Scheme != "https") {
				return errors.New("redirect refused")
			}
			return nil
		},
	}
}

var cgnat = netip.MustParsePrefix("100.64.0.0/10")

// publicIP reports whether ip is a globally routable unicast address.
func publicIP(ip net.IP) bool {
	a, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	a = a.Unmap()
	return a.IsGlobalUnicast() && !a.IsPrivate() && !a.IsLoopback() && !a.IsLinkLocalUnicast() && !cgnat.Contains(a)
}

func (s *Store) serve(w http.ResponseWriter, r *http.Request) {
	a, err := s.Get(r.PathValue("id"))
	if err != nil {
		jerr(w, 404, "not found")
		return
	}
	f, err := os.Open(filepath.Join(s.dir, a.ID+".bin"))
	if err != nil {
		jerr(w, 404, "not found")
		return
	}
	defer f.Close()
	h := w.Header()
	h.Set("Content-Type", a.Type)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Cache-Control", "private, max-age=31536000, immutable")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeContent(w, r, "", time.Time{}, f)
}
