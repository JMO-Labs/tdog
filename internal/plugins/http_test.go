package plugins

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
)

func TestValidZip(t *testing.T) {
	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
		Permissions: []string{"screen:read"},
	}

	jsContent := []byte(`console.log("test");`)

	raw := buildZip(t, &m, jsContent)

	store := New(t.TempDir())
	sm, token, err := store.Inspect(raw)
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if sm.Manifest.ID != "test-plugin" {
		t.Errorf("manifest id = %q, want test-plugin", sm.Manifest.ID)
	}
	if token == "" {
		t.Error("token empty")
	}
	if sm.SHA256 == "" {
		t.Error("sha256 empty")
	}
}

func TestZipSafetyRejectsZipSlip(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	_, _ = zw.Create("../../../etc/passwd")
	_ = zw.Close()

	store := New(t.TempDir())
	_, _, err := store.Inspect(buf.Bytes())
	if err == nil {
		t.Error("should reject zip slip")
	}
}

func TestZipSafetyRejectsNestedDirs(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	_, _ = zw.Create("subdir/tdog-plugin.json")
	_ = zw.Close()

	store := New(t.TempDir())
	_, _, err := store.Inspect(buf.Bytes())
	if err == nil {
		t.Error("should reject nested dirs")
	}
}

func TestZipSafetyRejectsTooMany(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for i := 0; i < 25; i++ {
		_, _ = zw.Create("file" + string(rune(i)) + ".txt")
	}
	_ = zw.Close()

	store := New(t.TempDir())
	_, _, err := store.Inspect(buf.Bytes())
	if err == nil {
		t.Error("should reject too many entries")
	}
}

func TestInstallAndRetrieve(t *testing.T) {
	dir := t.TempDir()
	store := New(dir)

	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
		Permissions: []string{"screen:read"},
	}
	jsContent := []byte(`console.log("test");`)

	raw := buildZip(t, &m, jsContent)
	_, token, _ := store.Inspect(raw)

	if err := store.Install(token, m.Permissions); err != nil {
		t.Fatalf("Install: %v", err)
	}

	// Verify files exist
	if _, err := os.Stat(filepath.Join(dir, "plugins", "test-plugin", "tdog-plugin.json")); err != nil {
		t.Error("manifest not written")
	}
	if _, err := os.Stat(filepath.Join(dir, "plugins", "test-plugin", "index.js")); err != nil {
		t.Error("entry not written")
	}
	if _, err := os.Stat(filepath.Join(dir, "plugins", "test-plugin", "state.json")); err != nil {
		t.Error("state not written")
	}
}

func TestListPlugins(t *testing.T) {
	dir := t.TempDir()
	store := New(dir)

	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
		Permissions: []string{"screen:read"},
	}
	raw := buildZip(t, &m, []byte("code"))
	_, token, _ := store.Inspect(raw)
	_ = store.Install(token, m.Permissions)

	list, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("list len = %d, want 1", len(list))
	}
	if list[0].ID != "test-plugin" {
		t.Errorf("id = %q, want test-plugin", list[0].ID)
	}
	if !list[0].Enabled {
		t.Error("should be enabled by default")
	}
}

func TestSetEnabled(t *testing.T) {
	dir := t.TempDir()
	store := New(dir)

	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
	}
	raw := buildZip(t, &m, []byte("code"))
	_, token, _ := store.Inspect(raw)
	_ = store.Install(token, m.Permissions)

	if err := store.SetEnabled("test-plugin", false); err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}

	list, _ := store.List()
	if list[0].Enabled {
		t.Error("should be disabled")
	}

	if err := store.SetEnabled("test-plugin", true); err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}

	list, _ = store.List()
	if !list[0].Enabled {
		t.Error("should be enabled")
	}
}

func TestHTTPHandlerList(t *testing.T) {
	dir := t.TempDir()
	store := New(dir)
	audit := audit.New(filepath.Join(dir, "audit.log"))

	handler := NewHTTPHandler(store, audit)
	mux := http.NewServeMux()
	handler.Register(mux)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/plugins", nil)
	mux.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var list []PluginInfo
	_ = json.NewDecoder(w.Body).Decode(&list)
	if list == nil {
		t.Error("list should not be nil")
	}
}

func TestHTTPHandlerInspectURL(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping URL fetch in short mode")
	}

	dir := t.TempDir()
	store := New(dir)
	audit := audit.New(filepath.Join(dir, "audit.log"))
	handler := NewHTTPHandler(store, audit)

	// Start a test server serving a valid plugin zip
	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
	}
	raw := buildZip(t, &m, []byte("code"))

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/zip")
		_, _ = w.Write(raw)
	}))
	defer ts.Close()

	mux := http.NewServeMux()
	handler.Register(mux)

	// Note: test URL is http, handler requires https; should be rejected
	body := []byte(`{"url":"http://example.com/plugin.zip"}`)
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/plugins/inspect", bytes.NewReader(body))
	mux.ServeHTTP(w, req)

	_ = ts // test server started but used for address only
	if w.Code != 400 {
		t.Errorf("status = %d, want 400 (https required)", w.Code)
	}
}

func TestHTTPHandlerInspectMultipart(t *testing.T) {
	dir := t.TempDir()
	store := New(dir)
	audit := audit.New(filepath.Join(dir, "audit.log"))
	handler := NewHTTPHandler(store, audit)

	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	mp, _ := mw.CreateFormField("manifest")
	mjson, _ := json.Marshal(m)
	_, _ = mp.Write(mjson)

	ep, _ := mw.CreateFormField("entry")
	_, _ = ep.Write([]byte("code"))

	_ = mw.Close()

	mux := http.NewServeMux()
	handler.Register(mux)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/plugins/inspect", bytes.NewReader(buf.Bytes()))
	req.Header.Set("Content-Type", mw.FormDataContentType())

	mux.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("status = %d, want 200: %s", w.Code, w.Body.String())
	}

	var sm StagedManifest
	_ = json.NewDecoder(w.Body).Decode(&sm)
	if sm.Manifest != nil && sm.Manifest.ID != "test-plugin" {
		t.Errorf("id = %q, want test-plugin", sm.Manifest.ID)
	}
}

func buildZip(t *testing.T, m *Manifest, jsContent []byte) []byte {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	mf, _ := zw.Create("tdog-plugin.json")
	mjson, _ := json.Marshal(m)
	_, _ = mf.Write(mjson)

	ef, _ := zw.Create(m.Entry)
	_, _ = ef.Write(jsContent)

	_ = zw.Close()
	return buf.Bytes()
}

func TestSSRFRejectsPrivateIPLiterals(t *testing.T) {
	dir := t.TempDir()
	store := New(dir)
	audit := audit.New(filepath.Join(dir, "audit.log"))
	handler := NewHTTPHandler(store, audit)

	mux := http.NewServeMux()
	handler.Register(mux)

	tests := []struct {
		url string
		ok  bool
	}{
		{"https://127.0.0.1/plugin.zip", false},
		{"https://192.168.1.1/plugin.zip", false},
		{"https://10.0.0.1/plugin.zip", false},
		{"https://169.254.1.1/plugin.zip", false},
		{"https://[::1]/plugin.zip", false},
	}

	for _, tt := range tests {
		w := httptest.NewRecorder()
		body := []byte(`{"url":"` + tt.url + `"}`)
		req := httptest.NewRequest("POST", "/api/plugins/inspect", bytes.NewReader(body))
		mux.ServeHTTP(w, req)

		if tt.ok && w.Code != 200 {
			t.Errorf("url %q: got %d, want 200", tt.url, w.Code)
		} else if !tt.ok && w.Code == 200 {
			t.Errorf("url %q: should be rejected", tt.url)
		}
	}
}

func TestStagedBundleCapacity(t *testing.T) {
	dir := t.TempDir()
	store := New(dir)

	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
	}

	// Fill up the staged bundles to capacity
	for i := 0; i < maxStagedBundles; i++ {
		raw := buildZip(t, &m, []byte("code"))
		_, _, err := store.Inspect(raw)
		if err != nil {
			t.Fatalf("fill %d: %v", i, err)
		}
	}

	// One more should fail
	raw := buildZip(t, &m, []byte("code"))
	_, _, err := store.Inspect(raw)
	if err == nil {
		t.Error("should reject when at capacity")
	}
}

func TestStagedBundleTTL(t *testing.T) {
	dir := t.TempDir()
	store := New(dir)

	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
	}

	raw := buildZip(t, &m, []byte("code"))
	_, token, err := store.Inspect(raw)
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}

	// Move time forward past TTL
	store.now = func() time.Time { return time.Now().Add(11 * time.Minute) }

	// Install should fail with expired token
	err = store.Install(token, m.Permissions)
	if err == nil {
		t.Error("should reject expired token")
	}
}
