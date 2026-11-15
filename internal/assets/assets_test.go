package assets

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func pngBytes(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 4, 3))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func newSrv(t *testing.T) (*Store, *http.ServeMux) {
	t.Helper()
	s := New(t.TempDir())
	mux := http.NewServeMux()
	s.Register(mux)
	return s, mux
}

func upload(mux *http.ServeMux, name string, data []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, _ := mw.CreateFormFile("file", name)
	_, _ = fw.Write(data)
	_ = mw.Close()
	r := httptest.NewRequest("POST", "/api/assets", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}

func do(mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}

func TestUploadListServeDelete(t *testing.T) {
	_, mux := newSrv(t)
	w := upload(mux, "../../evil.png", pngBytes(t))
	if w.Code != 201 {
		t.Fatalf("upload: %d %s", w.Code, w.Body)
	}
	var a Asset
	_ = json.Unmarshal(w.Body.Bytes(), &a)
	if a.Kind != "image" || a.Type != "image/png" || a.Width != 4 || a.Height != 3 || a.Size == 0 {
		t.Fatalf("meta: %+v", a)
	}
	if strings.Contains(a.ID, ".") || strings.Contains(a.ID, "/") {
		t.Fatalf("id from filename: %q", a.ID)
	}

	var list []Asset
	w = do(mux, "GET", "/api/assets", "")
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 || list[0].ID != a.ID {
		t.Fatalf("list: %s", w.Body)
	}

	w = do(mux, "GET", "/api/assets/"+a.ID, "")
	if w.Code != 200 || w.Header().Get("Content-Type") != "image/png" ||
		w.Header().Get("X-Content-Type-Options") != "nosniff" ||
		!strings.Contains(w.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("serve: %d %v", w.Code, w.Header())
	}

	if w = do(mux, "DELETE", "/api/assets/"+a.ID, ""); w.Code != 204 {
		t.Fatalf("delete: %d", w.Code)
	}
	if w = do(mux, "GET", "/api/assets/"+a.ID, ""); w.Code != 404 {
		t.Fatalf("after delete: %d", w.Code)
	}
	if w = do(mux, "DELETE", "/api/assets/"+a.ID, ""); w.Code != 404 {
		t.Fatalf("double delete: %d", w.Code)
	}
}

func TestBadIDs(t *testing.T) {
	_, mux := newSrv(t)
	for _, id := range []string{"abc", "zz", strings.Repeat("g", 32)} {
		if w := do(mux, "GET", "/api/assets/"+id, ""); w.Code != 404 {
			t.Fatalf("%s: %d", id, w.Code)
		}
	}
}

func TestRejectsType(t *testing.T) {
	_, mux := newSrv(t)
	if w := upload(mux, "a.png", []byte("<script>alert(1)</script>")); w.Code != 415 {
		t.Fatalf("html as png: %d", w.Code)
	}
	if w := upload(mux, "a.svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`)); w.Code != 415 {
		t.Fatalf("svg: %d", w.Code)
	}
}

func TestSizeCap(t *testing.T) {
	s, mux := newSrv(t)
	s.maxSize = 1024
	big := append(pngBytes(t), make([]byte, 2048)...)
	if w := upload(mux, "a.png", big); w.Code != 413 {
		t.Fatalf("cap: %d", w.Code)
	}
	if list, _ := s.List(); len(list) != 0 {
		t.Fatalf("leftover: %v", list)
	}
}

func TestSniffKinds(t *testing.T) {
	cases := map[string]string{
		"video/mp4":  "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom",
		"video/webm": "\x1a\x45\xdf\xa3\x01\x00\x00\x00",
		"image/gif":  "GIF89a\x01\x00\x01\x00\x00\x00\x00;",
		"image/webp": "RIFF\x00\x00\x00\x00WEBPVP8 ",
	}
	_, mux := newSrv(t)
	for want, data := range cases {
		w := upload(mux, "x", []byte(data))
		var a Asset
		_ = json.Unmarshal(w.Body.Bytes(), &a)
		if w.Code != 201 || a.Type != want {
			t.Errorf("%s: %d %+v", want, w.Code, a)
		}
	}
}

func remote(t *testing.T, s *Store, h http.HandlerFunc) *httptest.Server {
	t.Helper()
	ts := httptest.NewServer(h)
	t.Cleanup(ts.Close)
	s.allowIP = func(net.IP) bool { return true }
	return ts
}

func TestFetchURL(t *testing.T) {
	s, mux := newSrv(t)
	data := pngBytes(t)
	ts := remote(t, s, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(data) })
	b, _ := json.Marshal(map[string]string{"url": ts.URL + "/x.png"})
	w := do(mux, "POST", "/api/assets/url", string(b))
	if w.Code != 201 {
		t.Fatalf("fetch: %d %s", w.Code, w.Body)
	}
	// non-media and oversized remote bodies are refused
	ts2 := remote(t, s, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("hello")) })
	b, _ = json.Marshal(map[string]string{"url": ts2.URL})
	if w = do(mux, "POST", "/api/assets/url", string(b)); w.Code != 415 {
		t.Fatalf("type: %d", w.Code)
	}
	s.maxSize = 8
	b, _ = json.Marshal(map[string]string{"url": ts.URL})
	if w = do(mux, "POST", "/api/assets/url", string(b)); w.Code != 413 {
		t.Fatalf("cap: %d", w.Code)
	}
}

func TestFetchBlocksPrivate(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(pngBytes(t)) }))
	defer ts.Close()
	_, mux := newSrv(t) // default policy
	for _, u := range []string{ts.URL, "http://127.0.0.1:1/a.png", "http://10.1.2.3/a.png",
		"http://[::1]/a.png", "http://169.254.169.254/", "http://192.168.0.1/", "http://localhost/", "file:///etc/passwd", "ftp://example.com/a"} {
		b, _ := json.Marshal(map[string]string{"url": u})
		if w := do(mux, "POST", "/api/assets/url", string(b)); w.Code != 400 && w.Code != 403 {
			t.Errorf("%s: %d", u, w.Code)
		}
	}
	if w := do(mux, "POST", "/api/assets/url", "{"); w.Code != 400 {
		t.Errorf("bad json: %d", w.Code)
	}
}

func TestPublicIP(t *testing.T) {
	for ip, want := range map[string]bool{"8.8.8.8": true, "127.0.0.1": false, "10.0.0.1": false, "172.16.0.1": false,
		"192.168.1.1": false, "169.254.1.1": false, "0.0.0.0": false, "::1": false, "fc00::1": false, "100.64.0.1": false} {
		if got := publicIP(net.ParseIP(ip)); got != want {
			t.Errorf("%s: %v", ip, got)
		}
	}
}
