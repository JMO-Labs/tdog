package term

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/JMO-Labs/tdog/internal/audit"
)

const (
	maxFileSize   = 2 << 20 // 2 MB
	maxFileLines  = 20000
	diffTimeout   = 10 * time.Second
	diffContextIn = 3
)

// DiffRequest is the JSON body for POST /api/diff.
type DiffRequest struct {
	Session string `json:"session"`
	PathA   string `json:"a"`
	PathB   string `json:"b"`
	Context int    `json:"context"`
}

// DiffHandlerConfig provides dependencies for the diff handler.
type DiffHandlerConfig struct {
	Registry *Registry
	SSH      SSHConfig
	Audit    *audit.Logger
}

// NewDiffHandler returns an HTTP handler for POST /api/diff.
// Callers must wrap it with authentication and CSRF checks.
func NewDiffHandler(cfg DiffHandlerConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req DiffRequest
		if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		// Validate and clamp context to 0..20
		contextLines := req.Context
		if contextLines < 0 {
			contextLines = 0
		}
		if contextLines > 20 {
			contextLines = 20
		}

		// Look up session
		sess := cfg.Registry.get(req.Session)
		if sess == nil {
			http.Error(w, "session not found", http.StatusNotFound)
			return
		}

		// Create timeout context
		diffCtx, cancel := context.WithTimeout(context.Background(), diffTimeout)
		defer cancel()

		// Resolve paths and read files
		result, statusCode, errMsg := handleDiff(diffCtx, cfg.SSH, sess, req.PathA, req.PathB, contextLines)
		if statusCode != http.StatusOK {
			http.Error(w, errMsg, statusCode)
			// Audit non-200 responses
			if cfg.Audit != nil && statusCode != http.StatusNotFound {
				cfg.Audit.Log(audit.Entry{
					Event:   "diff",
					Target:  sess.target,
					Session: sess.id,
					Error:   errMsg,
				})
			}
			return
		}

		// Audit successful diff
		if cfg.Audit != nil {
			cfg.Audit.Log(audit.Entry{
				Event:   "diff",
				Target:  sess.target,
				Session: sess.id,
			})
		}

		// Send response
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(result)
	})
}

// handleDiff performs the diff operation with all safety checks.
func handleDiff(ctx context.Context, sshCfg SSHConfig, sess *Session, pathA, pathB string, contextLines int) (*FileDiffResult, int, string) {
	// Require absolute paths; frontend resolves relative paths using OSC 7 cwd
	if !filepath.IsAbs(pathA) {
		return nil, http.StatusBadRequest, "paths must be absolute"
	}
	if !filepath.IsAbs(pathB) {
		return nil, http.StatusBadRequest, "paths must be absolute"
	}

	// Check file sizes first (for container target only; SSH sizes are checked during read)
	if sess.target != "ssh-host" {
		sizeA, errSizeA := getFileSize(sshCfg, sess, pathA)
		sizeB, errSizeB := getFileSize(sshCfg, sess, pathB)

		if errSizeA != nil {
			return nil, http.StatusNotFound, "file a not found"
		}
		if errSizeB != nil {
			return nil, http.StatusNotFound, "file b not found"
		}

		if sizeA > maxFileSize {
			return nil, http.StatusRequestEntityTooLarge, fmt.Sprintf("file a too large: %d > %d bytes", sizeA, maxFileSize)
		}
		if sizeB > maxFileSize {
			return nil, http.StatusRequestEntityTooLarge, fmt.Sprintf("file b too large: %d > %d bytes", sizeB, maxFileSize)
		}
	}

	// Read files
	contentA, sizeA, errA := readFile(ctx, sshCfg, sess, pathA)
	contentB, sizeB, errB := readFile(ctx, sshCfg, sess, pathB)

	if errA != nil {
		if errA == ctx.Err() && ctx.Err() == context.DeadlineExceeded {
			return nil, http.StatusRequestTimeout, "timeout reading file a"
		}
		return nil, http.StatusNotFound, "file a not found"
	}
	if errB != nil {
		if errB == ctx.Err() && ctx.Err() == context.DeadlineExceeded {
			return nil, http.StatusRequestTimeout, "timeout reading file b"
		}
		return nil, http.StatusNotFound, "file b not found"
	}

	// Check binary files
	if isBinary(contentA) {
		return nil, http.StatusUnsupportedMediaType, "file a is binary"
	}
	if isBinary(contentB) {
		return nil, http.StatusUnsupportedMediaType, "file b is binary"
	}

	// Check line count
	linesA := bytes.Count(contentA, []byte("\n"))
	if linesA > maxFileLines {
		return nil, http.StatusRequestEntityTooLarge, fmt.Sprintf("file a too many lines: %d > %d", linesA, maxFileLines)
	}
	linesB := bytes.Count(contentB, []byte("\n"))
	if linesB > maxFileLines {
		return nil, http.StatusRequestEntityTooLarge, fmt.Sprintf("file b too many lines: %d > %d", linesB, maxFileLines)
	}

	// Compute diff
	hunks := Diff(contentA, contentB, contextLines)
	if hunks == nil && len(contentA) > 0 && len(contentB) > 0 {
		// nil hunks can mean identical or too-expensive; check if it's too-expensive
		oldLines := bytes.Count(contentA, []byte("\n")) + 1
		newLines := bytes.Count(contentB, []byte("\n")) + 1
		if int64(oldLines)*int64(newLines) > 25_000_000 {
			return nil, http.StatusRequestEntityTooLarge, "files differ too much to diff"
		}
	}

	result := &FileDiffResult{
		A: FileInfo{
			Path: pathA,
			Size: sizeA,
		},
		B: FileInfo{
			Path: pathB,
			Size: sizeB,
		},
		Hunks: hunks,
	}

	return result, http.StatusOK, ""
}

// isBinary checks if content looks like a binary file.
func isBinary(content []byte) bool {
	// Check for null bytes in the first 8KB
	n := len(content)
	if n > 8192 {
		n = 8192
	}
	return bytes.IndexByte(content[:n], 0) >= 0
}

// readFile reads a file from the session's target.
// Returns content, size, and error.
func readFile(ctx context.Context, sshCfg SSHConfig, sess *Session, path string) ([]byte, int64, error) {
	if sess.target == "ssh-host" {
		return readFileSSH(ctx, sshCfg, path)
	}
	return readFileContainer(path)
}

// getFileSize returns the size of a file for container targets.
// For SSH targets, size is checked during read with head -c.
func getFileSize(_ SSHConfig, sess *Session, path string) (int64, error) {
	if sess.target == "ssh-host" {
		return 0, nil // SSH size is validated during read
	}

	fi, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return fi.Size(), nil
}

// readFileContainer reads a file from the container filesystem.
func readFileContainer(path string) ([]byte, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = f.Close() }()

	fi, err := f.Stat()
	if err != nil {
		return nil, 0, err
	}

	if fi.Size() > maxFileSize {
		return nil, fi.Size(), fmt.Errorf("file too large")
	}

	content, err := io.ReadAll(f)
	return content, int64(len(content)), err
}

// readFileSSH reads a file from the remote SSH host using head with byte limit.
// Enforces the timeout from ctx and size limit.
func readFileSSH(ctx context.Context, sshCfg SSHConfig, path string) ([]byte, int64, error) {
	// Validate path
	if !isValidPath(path) {
		return nil, 0, fmt.Errorf("invalid path")
	}

	client, err := dialSSH(sshCfg)
	if err != nil {
		return nil, 0, err
	}
	// Close client when context is done
	go func() {
		<-ctx.Done()
		_ = client.Close()
	}()

	sess, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		return nil, 0, err
	}
	defer func() { _ = sess.Close() }()

	// Use head -c to limit bytes read, pass path as argument to prevent injection
	cmd := fmt.Sprintf("head -c %d -- %s", maxFileSize+1, sshQuoteForShell(path))
	output, err := sess.Output(cmd)
	if err != nil {
		_ = client.Close()
		// Check if context was cancelled (timeout)
		if ctx.Err() != nil {
			return nil, 0, ctx.Err()
		}
		return nil, 0, err
	}
	_ = client.Close()

	// Check if output exceeds limit
	if int64(len(output)) > maxFileSize {
		return nil, int64(len(output)), fmt.Errorf("file too large")
	}

	return output, int64(len(output)), nil
}

// isValidPath checks if a path is safe to pass to cat.
func isValidPath(path string) bool {
	// Paths should not be empty and should be valid UTF-8
	if path == "" {
		return false
	}
	// Disallow paths that look like they're trying to inject commands
	if strings.Contains(path, "\n") || strings.Contains(path, "\r") {
		return false
	}
	return true
}

// sshQuoteForShell escapes a path for safe use in a shell command.
func sshQuoteForShell(path string) string {
	// Use single quotes to prevent any interpretation, escape single quotes
	return "'" + strings.ReplaceAll(path, "'", `'\''`) + "'"
}
