package fonts

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func zipOf(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var b bytes.Buffer
	zw := zip.NewWriter(&b)
	for n, d := range files {
		f, _ := zw.Create(n)
		_, _ = f.Write(d)
	}
	_ = zw.Close()
	return b.Bytes()
}

func zipGetter(z []byte) Getter {
	return func(context.Context, string, int64) ([]byte, error) { return z, nil }
}

func TestHTTPGet(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok":
			_, _ = w.Write([]byte("hello"))
		case "/big":
			_, _ = w.Write(make([]byte, 100))
		case "/missing":
			w.WriteHeader(http.StatusNotFound)
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
	}))
	ctx := context.Background()
	if b, err := httpGet(ctx, srv.URL+"/ok", 10); err != nil || string(b) != "hello" {
		t.Fatalf("ok: %q %v", b, err)
	}
	if _, err := httpGet(ctx, srv.URL+"/big", 10); err == nil || !strings.Contains(err.Error(), "too large") {
		t.Fatalf("big: %v", err)
	}
	if _, err := httpGet(ctx, srv.URL+"/missing", 10); !errors.Is(err, ErrNotFound) {
		t.Fatalf("404: %v", err)
	}
	if _, err := httpGet(ctx, srv.URL+"/boom", 10); err == nil || !strings.Contains(err.Error(), "500") {
		t.Fatalf("500: %v", err)
	}
	if _, err := httpGet(ctx, "://bad", 10); err == nil {
		t.Fatal("bad url should fail")
	}
	srv.Close()
	if _, err := httpGet(ctx, srv.URL+"/ok", 10); err == nil {
		t.Fatal("closed server should fail")
	}
}

func TestNewDefaultsGetter(t *testing.T) {
	if s := New(t.TempDir(), nil); s.get == nil {
		t.Fatal("nil getter should default to HTTPS")
	}
}

func TestNerdPlainFallback(t *testing.T) {
	mux, _ := newMux(t, zipGetter(zipOf(t, map[string][]byte{"HackNerdFont-Regular.ttf": ttf})))
	if w := do(mux, "POST", "/api/fonts/nerd", `{"name":"Hack"}`); w.Code != 204 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if got := list(t, mux); len(got) != 1 || got[0].Family != "Hack Nerd Font" {
		t.Fatalf("%+v", got)
	}
}

func TestNerdEmptyAndBadArchive(t *testing.T) {
	mux, _ := newMux(t, zipGetter(zipOf(t, map[string][]byte{"LICENSE": ttf})))
	if w := do(mux, "POST", "/api/fonts/nerd", `{"name":"Hack"}`); w.Code != 502 {
		t.Fatalf("empty: %d", w.Code)
	}
	mux, _ = newMux(t, zipGetter(zipOf(t, map[string][]byte{"HackNerdFontMono-Regular.ttf": []byte("junk")})))
	if w := do(mux, "POST", "/api/fonts/nerd", `{"name":"Hack"}`); w.Code != 502 {
		t.Fatalf("bad font: %d", w.Code)
	}
}

func TestNerdUnreadableEntrySkipped(t *testing.T) {
	var b bytes.Buffer
	zw := zip.NewWriter(&b)
	// Unknown compression method: Open fails and the entry is skipped.
	w, err := zw.CreateRaw(&zip.FileHeader{
		Name: "HackNerdFontMono-Regular.ttf", Method: 99,
		CompressedSize64: 4, UncompressedSize64: 4,
	})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write([]byte("abcd"))
	_ = zw.Close()
	mux, _ := newMux(t, zipGetter(b.Bytes()))
	if r := do(mux, "POST", "/api/fonts/nerd", `{"name":"Hack"}`); r.Code != 502 {
		t.Fatalf("%d", r.Code)
	}
}

func googleGetter(listing string, fileErr error, data []byte) Getter {
	return func(_ context.Context, url string, _ int64) ([]byte, error) {
		if strings.HasPrefix(url, googleAPI) {
			return []byte(listing), nil
		}
		return data, fileErr
	}
}

const oneFile = `[{"name":"A-Regular.ttf","download_url":"https://raw.githubusercontent.com/google/fonts/main/ofl/a/A-Regular.ttf"}]`

func TestGoogleFailures(t *testing.T) {
	cases := map[string]Getter{
		"bad listing":   googleGetter("not json", nil, nil),
		"file download": googleGetter(oneFile, errors.New("down"), nil),
		"no files":      googleGetter(`[{"name":"OFL.txt","download_url":"x"}]`, nil, nil),
		"bad font":      googleGetter(oneFile, nil, []byte("junk")),
	}
	for name, get := range cases {
		mux, _ := newMux(t, get)
		if w := do(mux, "POST", "/api/fonts/google", `{"name":"Abc"}`); w.Code != 502 {
			t.Errorf("%s: %d", name, w.Code)
		}
	}
}

func TestUploadEdgeCases(t *testing.T) {
	mux, _ := newMux(t, nil)
	if w := upload(t, mux, "x.ttf", "", []byte("tiny")); w.Code != 400 {
		t.Fatalf("too small: %d", w.Code)
	}
	if w := upload(t, mux, "Var[wght].ttf", "Var", ttf); w.Code != 204 {
		t.Fatalf("variable: %d", w.Code)
	}
	if w := upload(t, mux, "Fira-Bold.ttf", "", ttf); w.Code != 204 {
		t.Fatalf("derived family: %d", w.Code)
	}
	got := list(t, mux)
	if len(got) != 2 || got[0].Family != "Fira" || got[1].Styles[0] != "Variable" {
		t.Fatalf("%+v", got)
	}
}

func TestUploadBadForm(t *testing.T) {
	mux, _ := newMux(t, nil)
	r := httptest.NewRequest("POST", "/api/fonts", strings.NewReader("plain"))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatalf("not multipart: %d", w.Code)
	}
	// Multipart without a "file" field.
	body := "--b\r\nContent-Disposition: form-data; name=\"family\"\r\n\r\nX\r\n--b--\r\n"
	r = httptest.NewRequest("POST", "/api/fonts", strings.NewReader(body))
	r.Header.Set("Content-Type", "multipart/form-data; boundary=b")
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 400 || !strings.Contains(w.Body.String(), "missing file") {
		t.Fatalf("no file field: %d %s", w.Code, w.Body)
	}
	// Body beyond the request cap is rejected by the reader.
	huge := make([]byte, MaxUpload+2<<20)
	copy(huge, ttf)
	if w := upload(t, mux, "huge.ttf", "", huge); w.Code != 413 {
		t.Fatalf("huge: %d", w.Code)
	}
}

func TestAddEmpty(t *testing.T) {
	_, s := newMux(t, nil)
	if err := s.add("Fam", "upload", nil); err == nil {
		t.Fatal("no files should fail")
	}
}

func TestDeleteKeepsOtherFamilies(t *testing.T) {
	mux, _ := newMux(t, nil)
	upload(t, mux, "A-Regular.ttf", "Aaa", ttf)
	upload(t, mux, "B-Regular.ttf", "Bbb", ttf)
	if w := do(mux, "DELETE", "/api/fonts/Aaa", ""); w.Code != 204 {
		t.Fatalf("%d", w.Code)
	}
	if got := list(t, mux); len(got) != 1 || got[0].Family != "Bbb" {
		t.Fatalf("%+v", got)
	}
}

func TestDiskFailures(t *testing.T) {
	// Data dir "fonts" is a regular file: no directory can be created.
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "fonts"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	s := New(dir, nil)
	if err := s.save(nil); err == nil {
		t.Fatal("save should fail when dir is a file")
	}
	if err := s.add("Fam", "upload", []blob{{"F-Regular.ttf", ttf}}); err == nil {
		t.Fatal("add should fail when dir is a file")
	}

	// Manifest temp path blocked by a directory.
	s = New(t.TempDir(), nil)
	if err := os.MkdirAll(filepath.Join(s.dir, "manifest.json.tmp"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := s.save(nil); err == nil {
		t.Fatal("save should fail when tmp is a directory")
	}

	// Font file path blocked by a directory.
	s = New(t.TempDir(), nil)
	if err := os.MkdirAll(filepath.Join(s.dir, "fam-regular.ttf"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := s.add("Fam", "upload", []blob{{"F-Regular.ttf", ttf}}); err == nil {
		t.Fatal("add should fail when file path is a directory")
	}
}

func TestDeleteSaveFailureIs500(t *testing.T) {
	mux, s := newMux(t, nil)
	upload(t, mux, "A-Regular.ttf", "Aaa", ttf)
	if err := os.MkdirAll(filepath.Join(s.dir, "manifest.json.tmp"), 0o700); err != nil {
		t.Fatal(err)
	}
	if w := do(mux, "DELETE", "/api/fonts/Aaa", ""); w.Code != 500 {
		t.Fatalf("%d", w.Code)
	}
}
