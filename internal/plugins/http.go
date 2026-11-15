package plugins

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
	"github.com/JMO-Labs/tdog/internal/netguard"
)

const (
	fetchTimeout = 10 * time.Second
	fetchMaxSize = 2 << 20 // 2 MB
)

// HTTPHandler wraps the store and audit logger for API endpoints.
type HTTPHandler struct {
	store *Store
	audit *audit.Logger
}

// NewHTTPHandler creates a handler wrapping store and audit.
func NewHTTPHandler(store *Store, audit *audit.Logger) *HTTPHandler {
	return &HTTPHandler{store: store, audit: audit}
}

// Register mounts plugin routes; they sit behind auth + CSRF middleware.
func (h *HTTPHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/plugins/inspect", h.handleInspect)
	mux.HandleFunc("POST /api/plugins/install", h.handleInstall)
	mux.HandleFunc("GET /api/plugins", h.handleList)
	mux.HandleFunc("PATCH /api/plugins/{id}", h.handlePatch)
	mux.HandleFunc("DELETE /api/plugins/{id}", h.handleDelete)
	mux.HandleFunc("GET /api/plugins/{id}/entry.js", h.handleEntry)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func jerr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func (h *HTTPHandler) handleInspect(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, fetchMaxSize+1<<20)

	// Check for multipart
	if ct := r.Header.Get("Content-Type"); ct != "" && ct[:19] == "multipart/form-data" {
		h.inspectMultipart(w, r)
		return
	}

	// Otherwise expect JSON with url
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jerr(w, 400, "invalid json")
		return
	}

	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "https") || u.Hostname() == "" {
		jerr(w, 400, "https url required")
		return
	}

	// Reject IP literals in URLs (prevent SSRF to private IPs)
	if ip := net.ParseIP(u.Hostname()); ip != nil {
		if !netguard.PublicIP(ip) {
			jerr(w, 403, "target address not allowed")
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), fetchTimeout)
	defer cancel()

	hr, _ := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	resp, err := h.fetchClient().Do(hr)
	if err != nil {
		jerr(w, 502, "download failed")
		return
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != 200 {
		jerr(w, 502, fmt.Sprintf("remote returned %d", resp.StatusCode))
		return
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, fetchMaxSize+1))
	if err != nil || len(raw) > fetchMaxSize {
		jerr(w, 413, "archive too large")
		return
	}

	sm, _, err := h.store.Inspect(raw)
	if err != nil {
		if err.Error() == "too many staged bundles; try again later" {
			w.Header().Set("Retry-After", "60")
			jerr(w, 429, "too many staged bundles; try again later")
		} else {
			jerr(w, 400, fmt.Sprintf("invalid plugin: %v", err))
		}
		return
	}

	writeJSON(w, 200, sm)
}

func (h *HTTPHandler) inspectMultipart(w http.ResponseWriter, r *http.Request) {
	mr, err := r.MultipartReader()
	if err != nil {
		jerr(w, 400, "multipart required")
		return
	}

	var manifestBytes, jsBytes []byte
	var manifest *Manifest

	for {
		p, err := mr.NextPart()
		if err != nil && err != io.EOF {
			jerr(w, 400, "multipart read error")
			return
		}
		if err == io.EOF {
			break
		}

		name := p.FormName()
		content, _ := io.ReadAll(io.LimitReader(p, 1<<20))

		if name == "manifest" && len(content) > 0 {
			var m Manifest
			if err := json.Unmarshal(content, &m); err != nil {
				jerr(w, 400, fmt.Sprintf("invalid manifest: %v", err))
				return
			}
			if err := m.Validate(); err != nil {
				jerr(w, 400, fmt.Sprintf("invalid manifest: %v", err))
				return
			}
			manifest = &m
			manifestBytes = content
		} else if (name == "file" || name == "entry") && len(content) > 0 {
			jsBytes = content
		}
	}

	if manifest == nil || len(jsBytes) == 0 {
		jerr(w, 400, "manifest and entry required")
		return
	}

	// Create a minimal zip for consistency
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	zmf, _ := zw.Create("tdog-plugin.json")
	zmf.Write(manifestBytes)
	zwf, _ := zw.Create(manifest.Entry)
	zwf.Write(jsBytes)
	zw.Close()

	raw := buf.Bytes()
	sm, _, err := h.store.Inspect(raw)
	if err != nil {
		if err.Error() == "too many staged bundles; try again later" {
			w.Header().Set("Retry-After", "60")
			jerr(w, 429, "too many staged bundles; try again later")
		} else {
			jerr(w, 400, fmt.Sprintf("invalid plugin: %v", err))
		}
		return
	}

	writeJSON(w, 200, sm)
}

func (h *HTTPHandler) handleInstall(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string   `json:"token"`
		Grant []string `json:"grant"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		jerr(w, 400, "invalid json")
		return
	}

	if err := h.store.Install(req.Token, req.Grant); err != nil {
		jerr(w, 400, fmt.Sprintf("install failed: %v", err))
		return
	}

	// Log audit event
	if info, _ := h.store.get(req.Token); info != nil {
		h.audit.Log(audit.Entry{
			Event:  "plugin_install",
			IP:     clientIP(r),
			Target: req.Token,
		})
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *HTTPHandler) handleList(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.List()
	if err != nil {
		jerr(w, 500, "list failed")
		return
	}
	if list == nil {
		list = []PluginInfo{}
	}
	writeJSON(w, 200, list)
}

func (h *HTTPHandler) handlePatch(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		jerr(w, 400, "invalid json")
		return
	}

	if req.Enabled == nil {
		jerr(w, 400, "enabled field required")
		return
	}

	if err := h.store.SetEnabled(id, *req.Enabled); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			jerr(w, 404, "plugin not found")
		} else {
			jerr(w, 500, "update failed")
		}
		return
	}

	event := "plugin_disable"
	if *req.Enabled {
		event = "plugin_enable"
	}
	h.audit.Log(audit.Entry{Event: event, Target: id, IP: clientIP(r)})

	w.WriteHeader(http.StatusNoContent)
}

func (h *HTTPHandler) handleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.store.Delete(id); err != nil && !errors.Is(err, os.ErrNotExist) {
		jerr(w, 500, "delete failed")
		return
	}
	h.audit.Log(audit.Entry{Event: "plugin_uninstall", Target: id, IP: clientIP(r)})
	w.WriteHeader(http.StatusNoContent)
}

func (h *HTTPHandler) handleEntry(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	content, err := h.store.GetEntry(id)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			jerr(w, 404, "not found")
		} else {
			jerr(w, 403, err.Error())
		}
		return
	}

	w.Header().Set("Content-Type", "text/javascript")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Access-Control-Allow-Origin", "null")
	w.Write(content)
}

// fetchClient returns an HTTP client that only fetches from public IPs.
func (h *HTTPHandler) fetchClient() *http.Client {
	d := &net.Dialer{
		Timeout: 10 * time.Second,
		Control: netguard.DialControl(netguard.PublicIP),
	}
	return &http.Client{
		Timeout:   fetchTimeout,
		Transport: &http.Transport{DialContext: d.DialContext, Proxy: nil},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("redirect refused")
			}
			if req.URL.Scheme != "https" {
				return errors.New("https required")
			}
			// Reject IP literals on redirects too
			if ip := net.ParseIP(req.URL.Hostname()); ip != nil && !netguard.PublicIP(ip) {
				return errors.New("target address not allowed")
			}
			return nil
		},
	}
}

func clientIP(r *http.Request) string {
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}
