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

// myers performs a Myers diff between old and new line sequences.
// Returns the edit script: sequence of operations to transform old into new.
func myers(old, new []string) []int {
	// Myers algorithm: find shortest edit script using O(ND) algorithm
	// where N = len(old), D = edit distance
	m, n := len(old), len(new)
	if m == 0 && n == 0 {
		return nil
	}

	// V array maps diagonal k to furthest reaching point on diagonal
	V := make(map[int]int)
	trace := []map[int]int{}

	for d := 0; d <= m+n; d++ {
		trace = append(trace, make(map[int]int))
		for k := -d; k <= d; k += 2 {
			var x int
			if k == -d || (k != d && V[k-1] < V[k+1]) {
				x = V[k+1]
			} else {
				x = V[k-1] + 1
			}
			y := x - k

			// Extend diagonal as far as possible
			for x < m && y < n && old[x] == new[y] {
				x++
				y++
			}

			V[k] = x
			trace[d][k] = x

			if x >= m && y >= n {
				// Found shortest edit script
				return backtrack(trace, old, new, d, k)
			}
		}
	}

	return nil
}

// backtrack reconstructs the edit script from the trace.
func backtrack(trace []map[int]int, old, new []string, d, k int) []int {
	var script []int
	x, y := len(old), len(new)

	for d > 0 {
		d--
		k_cur := k
		var k_prev int

		if k_cur == -d || (k_cur != d && trace[d][k_cur-1] < trace[d][k_cur+1]) {
			k_prev = k_cur + 1
		} else {
			k_prev = k_cur - 1
		}

		x_prev := trace[d][k_prev]
		y_prev := x_prev - k_prev

		// Record operations in reverse
		for x > x_prev || y > y_prev {
			if x > x_prev && y > y_prev && old[x-1] == new[y-1] {
				// Match: no operation needed, just move back
				x--
				y--
			} else if y > y_prev && (x == x_prev || old[x-1] != new[y-1]) {
				// Insert operation: new line added
				script = append(script, 1) // 1 = insert
				y--
			} else {
				// Delete operation: old line removed
				script = append(script, -1) // -1 = delete
				x--
			}
		}

		k = k_prev
	}

	// Reverse the script since we built it backwards
	for i := len(script)/2 - 1; i >= 0; i-- {
		opp := len(script) - 1 - i
		script[i], script[opp] = script[opp], script[i]
	}

	return script
}

// Diff computes a Myers diff between old and new content,
// returning hunks with context lines.
func Diff(oldContent, newContent []byte, context int) []DiffHunk {
	old := splitLines(oldContent)
	new := splitLines(newContent)

	if len(old) == 0 && len(new) == 0 {
		return nil
	}

	// Build a simple diff using patience algorithm variant
	// For simplicity and correctness, we'll use a straightforward LCS-based approach
	hunks := computeHunks(old, new, context)
	return hunks
}

// computeHunks produces hunks with context lines from two line sequences.
func computeHunks(old, new []string, context int) []DiffHunk {
	if context < 0 {
		context = 0
	}

	// Build edit sequence: -1 = delete old, 0 = match, 1 = insert new
	ops := diffOps(old, new)

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

// diffOps produces a sequence of operations using a simple algorithm.
// Returns slice where -1=delete, 0=match, 1=insert.
func diffOps(old, new []string) []int {
	// Use a simple longest-common-subsequence approach
	// Build LCS table
	m, n := len(old), len(new)
	lcs := make([][]int, m+1)
	for i := range lcs {
		lcs[i] = make([]int, n+1)
	}

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if old[i-1] == new[j-1] {
				lcs[i][j] = lcs[i-1][j-1] + 1
			} else {
				lcs[i][j] = max(lcs[i-1][j], lcs[i][j-1])
			}
		}
	}

	// Backtrack to build edit operations
	var ops []int
	i, j := m, n
	for i > 0 || j > 0 {
		if i > 0 && j > 0 && old[i-1] == new[j-1] {
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

	return ops
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
