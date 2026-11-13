package server

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

const placeholder = `<!doctype html><meta charset="utf-8"><title>tdog</title>` +
	`<p>tdog: web UI not built. Run <code>cd web &amp;&amp; npm run build</code>.</p>`

// uiHandler serves static files from ui, falling back to index.html for
// extensionless (SPA) paths. /api/ and /ws paths are never served by it.
func uiHandler(ui fs.FS) http.Handler {
	files := http.FileServerFS(ui)
	index, err := fs.ReadFile(ui, "index.html")
	if err != nil {
		index = []byte(placeholder)
	}
	serveIndex := func(w http.ResponseWriter) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(index)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if p == "/api" || p == "/ws" || strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/ws/") {
			http.NotFound(w, r)
			return
		}
		if p == "/" || p == "/index.html" {
			serveIndex(w)
			return
		}
		name := strings.TrimPrefix(path.Clean(p), "/")
		if st, err := fs.Stat(ui, name); err == nil && !st.IsDir() {
			files.ServeHTTP(w, r)
			return
		}
		if path.Ext(name) != "" { // missing asset: real 404, not HTML
			http.NotFound(w, r)
			return
		}
		serveIndex(w)
	})
}
