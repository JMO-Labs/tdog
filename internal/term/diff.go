// Package term implements a Myers line-diff algorithm for comparing text files.
package term

import (
	"bytes"
)

// DiffLine represents a single line in a diff with its operation and content.
type DiffLine struct {
	Op   string `json:"op"`   // " " (context), "-" (delete), "+" (add)
	Text string `json:"text"` // line content without newline
}

// DiffHunk represents a contiguous block of changes.
type DiffHunk struct {
	AStart int        `json:"aStart"` // 1-based line number in file A
	ALines int        `json:"aLines"` // number of lines from file A
	BStart int        `json:"bStart"` // 1-based line number in file B
	BLines int        `json:"bLines"` // number of lines from file B
	Lines  []DiffLine `json:"lines"`  // the actual diff lines
}

// DiffResult contains the complete diff between two files.
type DiffResult struct {
	APath string     `json:"a"` // will be {path, size}
	BPath string     `json:"b"` // will be {path, size}
	Hunks []DiffHunk `json:"hunks"`
}

// FileDiffResult is the JSON response format with file metadata and hunks.
type FileDiffResult struct {
	A     FileInfo   `json:"a"`
	B     FileInfo   `json:"b"`
	Hunks []DiffHunk `json:"hunks"`
}

// FileInfo contains path and size of a file.
type FileInfo struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// splitLines splits content into lines, stripping the newline character.
// Returns empty slice for empty content.
func splitLines(content []byte) []string {
	if len(content) == 0 {
		return nil
	}
	// Split by newline and strip \r if present
	lines := bytes.Split(content, []byte("\n"))
	// Remove the last empty element if content ended with newline
	if len(lines) > 0 && len(lines[len(lines)-1]) == 0 {
		lines = lines[:len(lines)-1]
	}
	result := make([]string, len(lines))
	for i, line := range lines {
		result[i] = string(bytes.TrimSuffix(line, []byte("\r")))
	}
	return result
}

// Diff computes a line-based diff between old and new content,
// returning hunks with context lines. Returns nil if files are identical
// or an error (413 status) if the diff is too expensive to compute.
func Diff(oldContent, newContent []byte, context int) []DiffHunk {
	old := splitLines(oldContent)
	new := splitLines(newContent)

	if len(old) == 0 && len(new) == 0 {
		return nil
	}

	hunks := computeHunks(old, new, context)
	return hunks
}

// computeHunks produces hunks with context lines from two line sequences.
// Returns nil if the diff is too expensive to compute (would return 413 from handler).
func computeHunks(old, new []string, context int) []DiffHunk {
	if context < 0 {
		context = 0
	}

	// Build edit sequence: -1 = delete old, 0 = match, 1 = insert new
	ops, errCode := diffOps(old, new)
	if errCode == 413 {
		return nil // signal to handler to return 413
	}

	var hunks []DiffHunk
	var currentHunk *DiffHunk
	oldIdx, newIdx := 0, 0

	for _, op := range ops {
		switch op {
		case -1: // delete
			if currentHunk == nil {
				// Start new hunk with context
				currentHunk = &DiffHunk{
					AStart: max(1, oldIdx-context+1),
					BStart: max(1, newIdx-context+1),
				}
				// Add context lines before this change
				for i := max(0, oldIdx-context); i < oldIdx && i < len(old); i++ {
					currentHunk.Lines = append(currentHunk.Lines, DiffLine{Op: " ", Text: old[i]})
				}
			}
			currentHunk.Lines = append(currentHunk.Lines, DiffLine{Op: "-", Text: old[oldIdx]})
			currentHunk.ALines++
			oldIdx++

		case 1: // insert
			if currentHunk == nil {
				currentHunk = &DiffHunk{
					AStart: max(1, oldIdx-context+1),
					BStart: max(1, newIdx-context+1),
				}
				// Add context lines before this change
				for i := max(0, oldIdx-context); i < oldIdx && i < len(old); i++ {
					currentHunk.Lines = append(currentHunk.Lines, DiffLine{Op: " ", Text: old[i]})
				}
			}
			currentHunk.Lines = append(currentHunk.Lines, DiffLine{Op: "+", Text: new[newIdx]})
			currentHunk.BLines++
			newIdx++

		case 0: // match
			if currentHunk != nil {
				// Add context lines after the hunk
				contextLines := 0
				for i := 0; i < context && oldIdx+i < len(old) && newIdx+i < len(new); i++ {
					if old[oldIdx+i] != new[newIdx+i] {
						break
					}
					currentHunk.Lines = append(currentHunk.Lines, DiffLine{Op: " ", Text: old[oldIdx+i]})
					contextLines++
					currentHunk.ALines++
					currentHunk.BLines++
				}
				hunks = append(hunks, *currentHunk)
				currentHunk = nil
			}
			oldIdx++
			newIdx++
		}
	}

	if currentHunk != nil {
		hunks = append(hunks, *currentHunk)
	}

	return hunks
}

const maxLCSTableCells = 25_000_000

// diffOps produces a sequence of operations using LCS.
// Returns slice where -1=delete, 0=match, 1=insert.
// Returns early with error code 413 if the LCS table would be too large.
func diffOps(old, new []string) ([]int, int) {
	m, n := len(old), len(new)

	// Trim common prefix
	prefixLen := 0
	for prefixLen < m && prefixLen < n && old[prefixLen] == new[prefixLen] {
		prefixLen++
	}
	if prefixLen == m && prefixLen == n {
		return nil, 0 // identical
	}

	// Trim common suffix
	suffixLen := 0
	for suffixLen < m-prefixLen && suffixLen < n-prefixLen &&
		old[m-1-suffixLen] == new[n-1-suffixLen] {
		suffixLen++
	}

	// Get middle part only
	oldMid := old[prefixLen : m-suffixLen]
	newMid := new[prefixLen : n-suffixLen]
	m, n = len(oldMid), len(newMid)

	// Check table size to prevent DoS
	if int64(m)*int64(n) > maxLCSTableCells {
		return nil, 413 // files differ too much
	}

	// Build LCS table for middle part only
	lcs := make([][]int, m+1)
	for i := range lcs {
		lcs[i] = make([]int, n+1)
	}

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if oldMid[i-1] == newMid[j-1] {
				lcs[i][j] = lcs[i-1][j-1] + 1
			} else {
				lcs[i][j] = max(lcs[i-1][j], lcs[i][j-1])
			}
		}
	}

	// Backtrack to build edit operations for middle part
	var ops []int
	i, j := m, n
	for i > 0 || j > 0 {
		if i > 0 && j > 0 && oldMid[i-1] == newMid[j-1] {
			ops = append([]int{0}, ops...)
			i--
			j--
		} else if j > 0 && (i == 0 || lcs[i][j-1] >= lcs[i-1][j]) {
			ops = append([]int{1}, ops...)
			j--
		} else {
			ops = append([]int{-1}, ops...)
			i--
		}
	}

	// Rebuild full operations: prefix matches, middle ops, suffix matches
	fullOps := make([]int, prefixLen)                    // prefix: all matches (0)
	fullOps = append(fullOps, ops...)                    // middle: computed ops
	fullOps = append(fullOps, make([]int, suffixLen)...) // suffix: all matches (0)

	return fullOps, 0
}
