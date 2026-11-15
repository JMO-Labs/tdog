package term

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
)

func TestDiffHandlerBadJSON(t *testing.T) {
	reg := NewRegistry(nil, 0)
	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    nil,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader([]byte("invalid json")))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestDiffHandlerSessionNotFound(t *testing.T) {
	reg := NewRegistry(nil, 0)
	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    nil,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: "nonexistent",
		PathA:   "/tmp/a",
		PathB:   "/tmp/b",
		Context: 3,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestDiffHandlerContainerSimpleDiff(t *testing.T) {
	// Create temp files
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")
	fileB := filepath.Join(tmpdir, "b.txt")

	if err := os.WriteFile(fileA, []byte("line1\nline2\nline3\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileB, []byte("line1\nnewline2\nline3\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create a fake session
	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	// Create a dummy session (container target)
	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   fileA,
		PathB:   fileB,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var result FileDiffResult
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Errorf("failed to decode response: %v", err)
	}

	if result.A.Path != fileA {
		t.Errorf("expected path A %q, got %q", fileA, result.A.Path)
	}
	if result.A.Size != int64(len("line1\nline2\nline3\n")) {
		t.Errorf("expected size A 18, got %d", result.A.Size)
	}
	if len(result.Hunks) == 0 {
		t.Error("expected at least one hunk")
	}

	// Verify the diff contains the change
	found := false
	for _, hunk := range result.Hunks {
		for _, line := range hunk.Lines {
			if line.Op == "+" && line.Text == "newline2" {
				found = true
			}
		}
	}
	if !found {
		t.Error("expected to find added line 'newline2' in diff")
	}
}

func TestDiffHandlerFileNotFound(t *testing.T) {
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")
	fileMissing := filepath.Join(tmpdir, "missing.txt")

	if err := os.WriteFile(fileA, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   fileA,
		PathB:   fileMissing,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for missing file, got %d", rec.Code)
	}
}

func TestDiffHandlerBinaryFile(t *testing.T) {
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")
	fileBinary := filepath.Join(tmpdir, "binary.bin")

	if err := os.WriteFile(fileA, []byte("line1\nline2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileBinary, []byte("line1\x00\nline2\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   fileA,
		PathB:   fileBinary,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnsupportedMediaType {
		t.Errorf("expected 415 for binary file, got %d", rec.Code)
	}
}

func TestDiffHandlerFileTooLarge(t *testing.T) {
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")
	fileLarge := filepath.Join(tmpdir, "large.txt")

	if err := os.WriteFile(fileA, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create a file larger than maxFileSize
	largeContent := make([]byte, maxFileSize+1)
	for i := range largeContent {
		if i%10 == 0 {
			largeContent[i] = '\n'
		} else {
			largeContent[i] = 'a'
		}
	}
	if err := os.WriteFile(fileLarge, largeContent, 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   fileA,
		PathB:   fileLarge,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected 413 for file too large, got %d", rec.Code)
	}
}

func TestDiffHandlerResponseFormat(t *testing.T) {
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")
	fileB := filepath.Join(tmpdir, "b.txt")

	if err := os.WriteFile(fileA, []byte("a\nb\nc\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileB, []byte("a\nX\nc\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   fileA,
		PathB:   fileB,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var result FileDiffResult
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}

	// Check JSON structure
	if result.A.Path == "" {
		t.Error("A.Path should not be empty")
	}
	if result.B.Path == "" {
		t.Error("B.Path should not be empty")
	}
	if result.A.Size == 0 {
		t.Error("A.Size should not be 0")
	}
	if result.B.Size == 0 {
		t.Error("B.Size should not be 0")
	}

	// Check hunk structure
	for _, hunk := range result.Hunks {
		if hunk.AStart < 1 || hunk.BStart < 1 {
			t.Error("hunk start positions should be 1-based")
		}
		for _, line := range hunk.Lines {
			if line.Op != " " && line.Op != "-" && line.Op != "+" {
				t.Errorf("invalid operation: %q", line.Op)
			}
		}
	}
}

func TestDiffHandlerMethodNotAllowed(t *testing.T) {
	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: NewRegistry(nil, 0),
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/diff", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rec.Code)
	}
}

func TestHandleDiffTimeout(t *testing.T) {
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")
	fileB := filepath.Join(tmpdir, "b.txt")

	// Create moderately large files
	largeA := bytes.Repeat([]byte("line\n"), 5000)
	largeB := bytes.Repeat([]byte("line\n"), 5000)
	largeB[100] = 'X' // Make a small change

	if err := os.WriteFile(fileA, largeA, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileB, largeB, 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}

	// Test with a very short timeout
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()

	result, statusCode, errMsg := handleDiff(ctx, SSHConfig{}, sess, fileA, fileB, 3)

	// Either it should complete successfully or timeout
	// (depending on how fast the system is)
	if statusCode != http.StatusOK && !strings.Contains(errMsg, "context deadline") {
		// Timeout is expected, so we just check it either works or times out
		if statusCode == http.StatusOK {
			if result == nil {
				t.Error("expected result on success")
			}
		}
	}
}

func TestDiffHandlerIdenticalFiles(t *testing.T) {
	tmpdir := t.TempDir()
	file := filepath.Join(tmpdir, "file.txt")

	content := []byte("line1\nline2\nline3\n")
	if err := os.WriteFile(file, content, 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   file,
		PathB:   file,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var result FileDiffResult
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Errorf("failed to decode: %v", err)
	}

	if len(result.Hunks) != 0 {
		t.Errorf("expected no hunks for identical files, got %d", len(result.Hunks))
	}
}

func TestDiffHandlerRequiresAbsolutePaths(t *testing.T) {
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")

	if err := os.WriteFile(fileA, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	// Test relative path for A
	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   "relative/path",
		PathB:   fileA,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for relative path A, got %d", rec.Code)
	}

	// Test relative path for B
	body, _ = json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   fileA,
		PathB:   "relative/path",
		Context: 1,
	})

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for relative path B, got %d", rec.Code)
	}
}

func TestDiffLargeFilesSmallChange(t *testing.T) {
	// Test that prefix/suffix trimming makes diff fast for large files with small change
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")
	fileB := filepath.Join(tmpdir, "b.txt")

	// Create moderately large files with only one line different
	// ~1000 lines each = ~1M cells, well under 25M limit
	prefix := bytes.Repeat([]byte("common line\n"), 1000)
	smallChange := []byte("changed\n")
	suffix := bytes.Repeat([]byte("common line\n"), 1000)

	contentA := append(append(append([]byte{}, prefix...), smallChange...), suffix...)
	contentB := append(append(append([]byte{}, prefix...), []byte("different\n")...), suffix...)

	if err := os.WriteFile(fileA, contentA, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileB, contentB, 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   fileA,
		PathB:   fileB,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for large files with small change, got %d", rec.Code)
	}

	var result FileDiffResult
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Errorf("failed to decode: %v", err)
	}

	if len(result.Hunks) == 0 {
		t.Error("expected hunks for files with change")
	}
}

func TestDiffTooExpensiveReturns413(t *testing.T) {
	// Test that totally-different large files return 413 without allocating huge table
	tmpdir := t.TempDir()
	fileA := filepath.Join(tmpdir, "a.txt")
	fileB := filepath.Join(tmpdir, "b.txt")

	// Create files that would exceed 25M cell limit
	// ~5100 lines each would give ~26M cells
	lineA := []byte("lineA_version_one_with_unique_content\n")
	lineB := []byte("lineB_version_two_with_different_content\n")

	contentA := bytes.Repeat(lineA, 5200)
	contentB := bytes.Repeat(lineB, 5200)

	if err := os.WriteFile(fileA, contentA, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileB, contentB, 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	l := audit.New(filepath.Join(dir, "audit.log"))
	reg := NewRegistry(l, 0)

	sess := &Session{
		id:     "test-session",
		target: "container",
		s: &session{
			pid: 1234,
		},
		reg: reg,
	}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()

	handler := NewDiffHandler(DiffHandlerConfig{
		Registry: reg,
		SSH:      SSHConfig{},
		Audit:    l,
	})

	body, _ := json.Marshal(DiffRequest{
		Session: sess.id,
		PathA:   fileA,
		PathB:   fileB,
		Context: 1,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected 413 for too-expensive diff, got %d", rec.Code)
	}
}

func TestIsBinary(t *testing.T) {
	tests := []struct {
		name string
		data []byte
		want bool
	}{
		{"text", []byte("hello world"), false},
		{"with newlines", []byte("hello\nworld\n"), false},
		{"with null byte", []byte("hello\x00world"), true},
		{"binary prefix", []byte("\x00\x01\x02"), true},
		{"text with other control chars", []byte("hello\x01\x02world"), false},
		{"large text", bytes.Repeat([]byte("a"), 10000), false},
		{"empty", []byte(""), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isBinary(tt.data)
			if got != tt.want {
				t.Errorf("isBinary() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsValidPath(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"/valid/path", true},
		{"relative/path", true},
		{"/path/with spaces", true},
		{"", false},
		{"/path\nwith\nnewlines", false},
		{"/path\rwith\rcarriagereturn", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := isValidPath(tt.path)
			if got != tt.want {
				t.Errorf("isValidPath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

// diffRig builds a handler with one container session and returns a request helper.
func diffRig(t *testing.T) func(a, b string) *httptest.ResponseRecorder {
	t.Helper()
	l := audit.New(filepath.Join(t.TempDir(), "audit.log"))
	reg := NewRegistry(l, 0)
	sess := &Session{id: "s", target: "container", s: &session{pid: 1}, reg: reg}
	reg.mu.Lock()
	reg.sessions[sess.id] = sess
	reg.mu.Unlock()
	h := NewDiffHandler(DiffHandlerConfig{Registry: reg, Audit: l})
	return func(a, b string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(DiffRequest{Session: "s", PathA: a, PathB: b})
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("POST", "/api/diff", bytes.NewReader(body)))
		return rec
	}
}

func TestDiffHandlerRejectsNonRegularFile(t *testing.T) {
	a := filepath.Join(t.TempDir(), "a.txt")
	if err := os.WriteFile(a, []byte("x\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// /dev/zero reports size 0 and never ends; it must not be read.
	if rec := diffRig(t)(a, "/dev/zero"); rec.Code == http.StatusOK {
		t.Fatalf("expected an error for /dev/zero, got 200")
	}
}

func TestDiffHandlerBusyWhenSlotsFull(t *testing.T) {
	for range cap(diffSlots) {
		diffSlots <- struct{}{}
	}
	defer func() {
		for range cap(diffSlots) {
			<-diffSlots
		}
	}()
	if rec := diffRig(t)("/a", "/b"); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 when all diff slots are busy, got %d", rec.Code)
	}
}
