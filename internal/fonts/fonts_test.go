package fonts

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var ttf = append([]byte{0, 1, 0, 0}, bytes.Repeat([]byte{7}, 32)...)

func newMux(t *testing.T, get Getter) (*http.ServeMux, *Store) {
	t.Helper()
	s := New(t.TempDir(), get)
	mux := http.NewServeMux()
	s.Register(mux)
	return mux, s
}

func upload(t *testing.T, mux *http.ServeMux, name, family string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var b bytes.Buffer
	mw := multipart.NewWriter(&b)
	if family != "" {
		_ = mw.WriteField("family", family)
	}
	fw, _ := mw.CreateFormFile("file", name)
	_, _ = fw.Write(data)
	_ = mw.Close()
	r := httptest.NewRequest("POST", "/api/fonts", &b)
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

func list(t *testing.T, mux *http.ServeMux) []Family {
	t.Helper()
	var out []Family
	w := do(mux, "GET", "/api/fonts", "")
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err, w.Body.String())
	}
	return out
}

func TestUploadListDelete(t *testing.T) {
	mux, _ := newMux(t, nil)
	if w := upload(t, mux, "Fira-Bold.ttf", "Fira Code", ttf); w.Code != 204 {
		t.Fatalf("upload: %d %s", w.Code, w.Body)
	}
	upload(t, mux, "Fira-Regular.ttf", "Fira Code", ttf)
	got := list(t, mux)
	if len(got) != 1 || got[0].Family != "Fira Code" || got[0].Source != "upload" || len(got[0].Styles) != 2 {
		t.Fatalf("list: %+v", got)
	}
	if w := do(mux, "DELETE", "/api/fonts/Fira%20Code", ""); w.Code != 204 {
		t.Fatalf("delete: %d", w.Code)
	}
	if len(list(t, mux)) != 0 {
		t.Fatal("not deleted")
	}
	if w := do(mux, "DELETE", "/api/fonts/Fira%20Code", ""); w.Code != 404 {
		t.Fatalf("second delete: %d", w.Code)
	}
}

func TestUploadValidation(t *testing.T) {
	mux, _ := newMux(t, nil)
	if w := upload(t, mux, "x.ttf", "", []byte("not a font at all")); w.Code != 400 {
		t.Fatalf("bad header: %d", w.Code)
	}
	if w := upload(t, mux, "x.exe", "", ttf); w.Code != 400 {
		t.Fatalf("bad ext: %d", w.Code)
	}
	if w := upload(t, mux, "x.woff2", "", ttf); w.Code != 400 {
		t.Fatalf("ext/header mismatch: %d", w.Code)
	}
	if w := upload(t, mux, "x.ttf", "bad/../fam", ttf); w.Code != 400 {
		t.Fatalf("bad family: %d", w.Code)
	}
	big := append(append([]byte{}, ttf...), make([]byte, MaxUpload)...)
	if w := upload(t, mux, "big.ttf", "", big); w.Code != 413 {
		t.Fatalf("too big: %d", w.Code)
	}
	for name, hdr := range map[string][]byte{"a.otf": []byte("OTTO0123456789"), "b.woff2": []byte("wOF20123456789")} {
		if w := upload(t, mux, name, "", hdr); w.Code != 204 {
			t.Fatalf("%s: %d %s", name, w.Code, w.Body)
		}
	}
}

func TestFontsCSS(t *testing.T) {
	mux, _ := newMux(t, nil)
	upload(t, mux, "Fira-Bold.ttf", "Fira Code", ttf)
	upload(t, mux, "Fira-Italic.ttf", "Fira Code", ttf)
	w := do(mux, "GET", "/api/fonts.css", "")
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/css") {
		t.Fatal(ct)
	}
	css := w.Body.String()
	for _, want := range []string{`font-family: "Fira Code"`, "font-weight: 700", "font-style: italic", "font-display: swap", "/api/fonts/files/", `format("truetype")`} {
		if !strings.Contains(css, want) {
			t.Errorf("css missing %q:\n%s", want, css)
		}
	}
	var url string
	for _, l := range strings.Split(css, "\n") {
		if i := strings.Index(l, `url("`); i >= 0 {
			url = l[i+5 : i+strings.Index(l[i+5:], `"`)+5]
			break
		}
	}
	if f := do(mux, "GET", url, ""); f.Code != 200 || !bytes.Equal(f.Body.Bytes(), ttf) {
		t.Fatalf("file %s: %d", url, f.Code)
	}
	if f := do(mux, "GET", "/api/fonts/files/..%2Fmanifest.json", ""); f.Code != 404 {
		t.Fatalf("traversal: %d", f.Code)
	}
}

func nerdZip(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	zw := zip.NewWriter(&b)
	for _, n := range []string{
		"JetBrainsMonoNerdFontMono-Regular.ttf", "JetBrainsMonoNerdFontMono-Bold.ttf",
		"JetBrainsMonoNerdFontMono-Thin.ttf", "JetBrainsMonoNerdFont-Regular.ttf", "LICENSE",
	} {
		f, _ := zw.Create(n)
		_, _ = f.Write(ttf)
	}
	_ = zw.Close()
	return b.Bytes()
}

func TestNerdInstall(t *testing.T) {
	var asked string
	get := func(_ context.Context, url string, _ int64) ([]byte, error) {
		asked = url
		return nerdZip(t), nil
	}
	mux, _ := newMux(t, get)
	w := do(mux, "POST", "/api/fonts/nerd", `{"name":"JetBrainsMono"}`)
	if w.Code != 204 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if asked != "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip" {
		t.Fatal(asked)
	}
	got := list(t, mux)
	if len(got) != 1 || got[0].Family != "JetBrainsMono Nerd Font Mono" || got[0].Source != "nerd" || len(got[0].Styles) != 2 {
		t.Fatalf("%+v", got)
	}
	for _, bad := range []string{`{"name":"../x"}`, `{"name":""}`, `{`} {
		if w := do(mux, "POST", "/api/fonts/nerd", bad); w.Code != 400 {
			t.Fatalf("%s: %d", bad, w.Code)
		}
	}
}

func TestNerdDownloadFailure(t *testing.T) {
	mux, _ := newMux(t, func(context.Context, string, int64) ([]byte, error) { return nil, errors.New("down") })
	if w := do(mux, "POST", "/api/fonts/nerd", `{"name":"Hack"}`); w.Code != 502 {
		t.Fatalf("%d", w.Code)
	}
	mux, _ = newMux(t, func(context.Context, string, int64) ([]byte, error) { return []byte("not zip"), nil })
	if w := do(mux, "POST", "/api/fonts/nerd", `{"name":"Hack"}`); w.Code != 502 {
		t.Fatalf("bad zip: %d", w.Code)
	}
}

func TestGoogleInstall(t *testing.T) {
	var urls []string
	get := func(_ context.Context, url string, _ int64) ([]byte, error) {
		urls = append(urls, url)
		if strings.HasPrefix(url, "https://api.github.com/repos/google/fonts/contents/ofl/") {
			return []byte(`[{"name":"OFL.txt","download_url":"https://raw.githubusercontent.com/google/fonts/main/ofl/x/OFL.txt"},
{"name":"Inconsolata-Regular.ttf","download_url":"https://raw.githubusercontent.com/google/fonts/main/ofl/inconsolata/Inconsolata-Regular.ttf"},
{"name":"Inconsolata-Bold.ttf","download_url":"https://raw.githubusercontent.com/google/fonts/main/ofl/inconsolata/Inconsolata-Bold.ttf"},
{"name":"Evil.ttf","download_url":"https://evil.example/Evil.ttf"}]`), nil
		}
		return ttf, nil
	}
	mux, _ := newMux(t, get)
	if w := do(mux, "POST", "/api/fonts/google", `{"name":"Inconsolata"}`); w.Code != 204 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if urls[0] != "https://api.github.com/repos/google/fonts/contents/ofl/inconsolata" {
		t.Fatal(urls[0])
	}
	got := list(t, mux)
	if len(got) != 1 || got[0].Family != "Inconsolata" || got[0].Source != "google" || len(got[0].Styles) != 2 {
		t.Fatalf("%+v", got)
	}
	for _, u := range urls {
		if strings.Contains(u, "evil") {
			t.Fatal("fetched foreign host")
		}
	}
	if w := do(mux, "POST", "/api/fonts/google", `{"name":"../etc"}`); w.Code != 400 {
		t.Fatalf("bad name: %d", w.Code)
	}
}

func TestGoogleNotOFL(t *testing.T) {
	mux, _ := newMux(t, func(context.Context, string, int64) ([]byte, error) { return nil, ErrNotFound })
	if w := do(mux, "POST", "/api/fonts/google", `{"name":"Some Apache Font"}`); w.Code != 404 {
		t.Fatalf("%d", w.Code)
	}
}

func TestPersistsAcrossStores(t *testing.T) {
	dir := t.TempDir()
	mux := http.NewServeMux()
	New(dir, nil).Register(mux)
	upload(t, mux, "A-Regular.ttf", "Persist", ttf)
	mux2 := http.NewServeMux()
	New(dir, nil).Register(mux2)
	if got := list(t, mux2); len(got) != 1 || got[0].Family != "Persist" {
		t.Fatalf("%+v", got)
	}
}
