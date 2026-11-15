package assets

import (
	"bytes"
	"errors"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type readerFunc func([]byte) (int, error)

func (f readerFunc) Read(p []byte) (int, error) { return f(p) }

// brokenDir returns a store whose assets path is a regular file.
func brokenDir(t *testing.T) (*Store, *http.ServeMux) {
	t.Helper()
	s, mux := newSrv(t)
	if err := os.WriteFile(s.dir, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	return s, mux
}

func skipIfRoot(t *testing.T) {
	t.Helper()
	if os.Geteuid() == 0 {
		t.Skip("permission bits are ignored for root")
	}
}

func TestStoreErrorsWhenDirIsFile(t *testing.T) {
	s, mux := brokenDir(t)
	if _, err := s.List(); err == nil {
		t.Fatal("List: want error")
	}
	if w := do(mux, "GET", "/api/assets", ""); w.Code != 500 {
		t.Fatalf("list: %d", w.Code)
	}
	if w := do(mux, "DELETE", "/api/assets/"+newID(), ""); w.Code != 500 {
		t.Fatalf("delete: %d", w.Code)
	}
	if w := upload(mux, "a.png", pngBytes(t)); w.Code != 500 {
		t.Fatalf("upload: %d", w.Code)
	}
}

func TestDeleteBadID(t *testing.T) {
	s, _ := newSrv(t)
	if err := s.Delete("../x"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("got %v", err)
	}
}

func TestIngestReadError(t *testing.T) {
	s, _ := newSrv(t)
	boom := errors.New("boom")
	if _, err := s.ingest(readerFunc(func([]byte) (int, error) { return 0, boom })); !errors.Is(err, boom) {
		t.Fatalf("got %v", err)
	}
}

func TestIngestTempCreateFails(t *testing.T) {
	skipIfRoot(t)
	s, _ := newSrv(t)
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		t.Fatal(err)
	}
	_ = os.Chmod(s.dir, 0o500)
	t.Cleanup(func() { _ = os.Chmod(s.dir, 0o700) })
	if _, err := s.ingest(bytes.NewReader(pngBytes(t))); err == nil {
		t.Fatal("want error")
	}
}

func TestIngestMetaWriteFails(t *testing.T) {
	skipIfRoot(t)
	s, _ := newSrv(t)
	data := bytes.NewReader(pngBytes(t))
	t.Cleanup(func() { _ = os.Chmod(s.dir, 0o700) })
	// lock the directory once the body is fully read: temp file exists, json cannot be written
	r := readerFunc(func(p []byte) (int, error) {
		n, err := data.Read(p)
		if err == io.EOF {
			_ = os.Chmod(s.dir, 0o500)
		}
		return n, err
	})
	if _, err := s.ingest(r); err == nil {
		t.Fatal("want error")
	}
}

func TestUploadMultipartEdges(t *testing.T) {
	_, mux := newSrv(t)
	r := httptest.NewRequest("POST", "/api/assets", strings.NewReader("x"))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatalf("not multipart: %d", w.Code)
	}

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("other", "v")
	_ = mw.Close()
	r = httptest.NewRequest("POST", "/api/assets", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatalf("no file field: %d", w.Code)
	}
}

func TestUploadBodyOverCap(t *testing.T) {
	s, mux := newSrv(t)
	s.maxSize = 0 // body limit is 1 MiB
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, _ := mw.CreateFormField("other")
	_, _ = fw.Write(make([]byte, 2<<20))
	_ = mw.Close()
	r := httptest.NewRequest("POST", "/api/assets", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 413 {
		t.Fatalf("got %d", w.Code)
	}
}

func fetch(mux *http.ServeMux, u string) *httptest.ResponseRecorder {
	b := `{"url":` + `"` + u + `"}`
	return do(mux, "POST", "/api/assets/url", b)
}

func TestFetchFailures(t *testing.T) {
	s, mux := newSrv(t)
	ts := remote(t, s, func(w http.ResponseWriter, _ *http.Request) { http.NotFound(w, nil) })
	if w := fetch(mux, ts.URL); w.Code != 502 {
		t.Fatalf("status: %d", w.Code)
	}
	short := remote(t, s, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Length", "100")
		_, _ = w.Write([]byte("abc"))
	})
	if w := fetch(mux, short.URL); w.Code != 502 {
		t.Fatalf("truncated: %d", w.Code)
	}
	dead := httptest.NewServer(http.NotFoundHandler())
	u := dead.URL
	dead.Close()
	if w := fetch(mux, u); w.Code != 502 {
		t.Fatalf("dial: %d", w.Code)
	}
}

func TestFetchRedirects(t *testing.T) {
	s, mux := newSrv(t)
	data := pngBytes(t)
	ts := remote(t, s, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/final":
			_, _ = w.Write(data)
		case "/loop":
			http.Redirect(w, r, "/loop", http.StatusFound)
		case "/ftp":
			http.Redirect(w, r, "ftp://example.com/a", http.StatusFound)
		default:
			http.Redirect(w, r, "/final", http.StatusFound)
		}
	})
	if w := fetch(mux, ts.URL+"/start"); w.Code != 201 {
		t.Fatalf("follow: %d %s", w.Code, w.Body)
	}
	for _, p := range []string{"/loop", "/ftp"} {
		if w := fetch(mux, ts.URL+p); w.Code != 502 {
			t.Fatalf("%s: %d", p, w.Code)
		}
	}
}

func TestPublicIPInvalid(t *testing.T) {
	if publicIP(net.IP{1, 2, 3}) {
		t.Fatal("malformed ip allowed")
	}
}

func TestServeMissingBlob(t *testing.T) {
	s, mux := newSrv(t)
	a, err := s.ingest(bytes.NewReader(pngBytes(t)))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(s.dir, a.ID+".bin")); err != nil {
		t.Fatal(err)
	}
	if w := do(mux, "GET", "/api/assets/"+a.ID, ""); w.Code != 404 {
		t.Fatalf("got %d", w.Code)
	}
}

func TestIngestTempVanishes(t *testing.T) {
	s, _ := newSrv(t)
	data := bytes.NewReader([]byte("hello"))
	r := readerFunc(func(p []byte) (int, error) {
		n, err := data.Read(p)
		if err == io.EOF {
			m, _ := filepath.Glob(filepath.Join(s.dir, ".upload-*"))
			for _, f := range m {
				_ = os.Remove(f)
			}
		}
		return n, err
	})
	if _, err := s.ingest(r); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("got %v", err)
	}
}

func TestIngestRenameFails(t *testing.T) {
	s, _ := newSrv(t)
	boom := errors.New("boom")
	old := rename
	rename = func(string, string) error { return boom }
	t.Cleanup(func() { rename = old })
	if _, err := s.ingest(bytes.NewReader(pngBytes(t))); !errors.Is(err, boom) {
		t.Fatalf("got %v", err)
	}
	m, _ := filepath.Glob(filepath.Join(s.dir, "*.json"))
	if len(m) != 0 {
		t.Fatalf("json left behind: %v", m)
	}
}

func TestDialControl(t *testing.T) {
	c := dialControl(func(ip net.IP) bool { return ip.IsLoopback() })
	if err := c("tcp", "nohostport", nil); !errors.Is(err, errBlocked) {
		t.Errorf("bad addr: %v", err)
	}
	if err := c("tcp", "example.com:80", nil); !errors.Is(err, errBlocked) {
		t.Errorf("non-ip: %v", err)
	}
	if err := c("tcp", "8.8.8.8:80", nil); !errors.Is(err, errBlocked) {
		t.Errorf("disallowed: %v", err)
	}
	if err := c("tcp", "127.0.0.1:80", nil); err != nil {
		t.Errorf("allowed: %v", err)
	}
}
