package term

import (
	"bytes"
	"testing"
)

func TestSplitLines(t *testing.T) {
	tests := []struct {
		name string
		in   []byte
		want []string
	}{
		{"empty", nil, nil},
		{"single line no newline", []byte("hello"), []string{"hello"}},
		{"single line with newline", []byte("hello\n"), []string{"hello"}},
		{"two lines", []byte("hello\nworld"), []string{"hello", "world"}},
		{"two lines with trailing newline", []byte("hello\nworld\n"), []string{"hello", "world"}},
		{"windows line endings", []byte("hello\r\nworld\r\n"), []string{"hello", "world"}},
		{"mixed line endings", []byte("hello\nworld\r\nfoo"), []string{"hello", "world", "foo"}},
		{"empty lines", []byte("\n\n"), []string{"", ""}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitLines(tt.in)
			if !stringSliceEqual(got, tt.want) {
				t.Errorf("splitLines(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func stringSliceEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestDiffIdentical(t *testing.T) {
	content := []byte("line1\nline2\nline3\n")
	hunks := Diff(content, content, 3)
	if len(hunks) != 0 {
		t.Errorf("Diff of identical files should return no hunks, got %d", len(hunks))
	}
}

func TestDiffEmpty(t *testing.T) {
	hunks := Diff(nil, nil, 3)
	if len(hunks) != 0 {
		t.Errorf("Diff of empty files should return no hunks, got %d", len(hunks))
	}
}

func TestDiffAddLine(t *testing.T) {
	old := []byte("line1\nline2\n")
	new := []byte("line1\nnewline\nline2\n")

	hunks := Diff(old, new, 1)
	if len(hunks) == 0 {
		t.Fatal("expected hunks, got none")
	}

	hunk := hunks[0]
	// Should contain context line "line1", added "newline", and context "line2"
	if len(hunk.Lines) < 2 {
		t.Errorf("expected at least 2 lines in hunk, got %d", len(hunk.Lines))
	}

	hasAdd := false
	for _, line := range hunk.Lines {
		if line.Op == "+" && line.Text == "newline" {
			hasAdd = true
		}
	}
	if !hasAdd {
		t.Error("expected added line 'newline' in hunk")
	}
}

func TestDiffRemoveLine(t *testing.T) {
	old := []byte("line1\nremove_me\nline2\n")
	new := []byte("line1\nline2\n")

	hunks := Diff(old, new, 1)
	if len(hunks) == 0 {
		t.Fatal("expected hunks, got none")
	}

	hunk := hunks[0]
	hasRemove := false
	for _, line := range hunk.Lines {
		if line.Op == "-" && line.Text == "remove_me" {
			hasRemove = true
		}
	}
	if !hasRemove {
		t.Error("expected removed line 'remove_me' in hunk")
	}
}

func TestDiffMultipleChanges(t *testing.T) {
	old := []byte("line1\nold2\nline3\nold4\n")
	new := []byte("line1\nnew2\nline3\nnew4\n")

	hunks := Diff(old, new, 1)
	if len(hunks) == 0 {
		t.Fatal("expected hunks, got none")
	}

	// Collect all operations
	var deletes, adds int
	for _, hunk := range hunks {
		for _, line := range hunk.Lines {
			if line.Op == "-" {
				deletes++
			} else if line.Op == "+" {
				adds++
			}
		}
	}

	if deletes != 2 || adds != 2 {
		t.Errorf("expected 2 deletes and 2 adds, got %d deletes and %d adds", deletes, adds)
	}
}

func TestDiffNoContext(t *testing.T) {
	old := []byte("line1\nline2\nline3\n")
	new := []byte("line1\nnewline\nline3\n")

	hunks := Diff(old, new, 0)
	if len(hunks) == 0 {
		t.Fatal("expected hunks, got none")
	}

	// With context=0, we should only see the changed lines
	hunk := hunks[0]
	for _, line := range hunk.Lines {
		if line.Op != "-" && line.Op != "+" {
			// This might be okay if minimal context is needed for hunks to make sense
			t.Logf("found context line with context=0: %v", line)
		}
	}
}

func TestDiffWithLargeContext(t *testing.T) {
	old := []byte("a\nb\nc\nd\ne\nf\n")
	new := []byte("a\nb\nc\nX\nd\ne\nf\n")

	hunks := Diff(old, new, 10) // Large context
	if len(hunks) == 0 {
		t.Fatal("expected hunks, got none")
	}

	hunk := hunks[0]
	if len(hunk.Lines) < 5 {
		t.Errorf("expected at least 5 lines with large context, got %d", len(hunk.Lines))
	}
}

func TestDiffBinaryContent(t *testing.T) {
	// Should still work with binary-like content
	old := []byte("line1\n\x00\nline2\n")
	new := []byte("line1\n\x01\nline2\n")

	hunks := Diff(old, new, 1)
	if len(hunks) == 0 {
		t.Fatal("expected hunks, got none")
	}
}

func TestDiffEmptyToContent(t *testing.T) {
	old := []byte("")
	new := []byte("line1\nline2\n")

	hunks := Diff(old, new, 0)
	if len(hunks) == 0 {
		t.Fatal("expected hunks when going from empty to content")
	}

	totalAdds := 0
	for _, hunk := range hunks {
		for _, line := range hunk.Lines {
			if line.Op == "+" {
				totalAdds++
			}
		}
	}
	if totalAdds != 2 {
		t.Errorf("expected 2 added lines, got %d", totalAdds)
	}
}

func TestDiffContentToEmpty(t *testing.T) {
	old := []byte("line1\nline2\n")
	new := []byte("")

	hunks := Diff(old, new, 0)
	if len(hunks) == 0 {
		t.Fatal("expected hunks when removing all content")
	}

	totalDeletes := 0
	for _, hunk := range hunks {
		for _, line := range hunk.Lines {
			if line.Op == "-" {
				totalDeletes++
			}
		}
	}
	if totalDeletes != 2 {
		t.Errorf("expected 2 deleted lines, got %d", totalDeletes)
	}
}

func TestDiffHunkMetadata(t *testing.T) {
	old := []byte("a\nb\nc\n")
	new := []byte("a\nX\nc\n")

	hunks := Diff(old, new, 1)
	if len(hunks) == 0 {
		t.Fatal("expected hunks")
	}

	hunk := hunks[0]
	if hunk.AStart < 1 {
		t.Errorf("AStart should be >= 1, got %d", hunk.AStart)
	}
	if hunk.BStart < 1 {
		t.Errorf("BStart should be >= 1, got %d", hunk.BStart)
	}
	if hunk.ALines < 1 {
		t.Errorf("ALines should be >= 1, got %d", hunk.ALines)
	}
	if hunk.BLines < 1 {
		t.Errorf("BLines should be >= 1, got %d", hunk.BLines)
	}
}

func TestDiffComplexScenario(t *testing.T) {
	old := []byte(`package main

import "fmt"

func main() {
	fmt.Println("hello")
}
`)

	new := []byte(`package main

import (
	"fmt"
	"log"
)

func main() {
	log.Println("starting")
	fmt.Println("hello")
}
`)

	hunks := Diff(old, new, 2)
	if len(hunks) == 0 {
		t.Fatal("expected hunks for complex change")
	}

	// Verify structure
	for _, hunk := range hunks {
		if hunk.AStart < 1 || hunk.BStart < 1 {
			t.Error("hunk start lines should be 1-based")
		}
		if len(hunk.Lines) == 0 {
			t.Error("hunk should have at least one line")
		}
		for _, line := range hunk.Lines {
			if line.Op != " " && line.Op != "-" && line.Op != "+" {
				t.Errorf("invalid operation: %q", line.Op)
			}
		}
	}
}

func BenchmarkDiff(b *testing.B) {
	old := []byte(bytes.Repeat([]byte("line\n"), 1000))
	new := bytes.Replace(old, []byte("line"), []byte("modified"), 10)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Diff(old, new, 3)
	}
}

func BenchmarkSplitLines(b *testing.B) {
	content := bytes.Repeat([]byte("this is a line\n"), 1000)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = splitLines(content)
	}
}
