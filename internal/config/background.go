package config

import "regexp"

var (
	bgKinds = map[string]bool{"none": true, "color": true, "image": true, "shader": true,
		"gradient": true, "pattern": true, "video": true}
	// refSlug covers asset ids (hex) and built-in ids; never a path or URL.
	refSlug   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
	gradChars = regexp.MustCompile(`^[A-Za-z0-9#%.,\s()/+-]+$`)
	gradFuncs = regexp.MustCompile(`([A-Za-z-]*)\(`)
	gradStart = regexp.MustCompile(`^(linear|radial)-gradient\(`)
	gradColor = map[string]bool{"rgb": true, "rgba": true, "hsl": true, "hsla": true}
)

const maxGradient = 512

// validGradient accepts linear/radial-gradient(...) whose only functions are
// the colour functions: no url(), var(), expression() or raw declarations.
func validGradient(s string) bool {
	if len(s) > maxGradient || !gradChars.MatchString(s) || !gradStart.MatchString(s) || s[len(s)-1] != ')' {
		return false
	}
	calls := gradFuncs.FindAllStringSubmatch(s, -1)
	opens := 0
	for _, c := range s {
		if c == '(' {
			opens++
		}
	}
	if len(calls) != opens {
		return false
	}
	for _, c := range calls[1:] {
		if !gradColor[c[1]] {
			return false
		}
	}
	depth := 0
	for i, c := range s {
		switch c {
		case '(':
			depth++
		case ')':
			depth--
			if depth < 0 || (depth == 0 && i != len(s)-1) {
				return false
			}
		}
	}
	return depth == 0
}

// validRef checks background.ref against the kind's grammar.
func validRef(kind, ref string) bool {
	switch kind {
	case "gradient":
		return validGradient(ref)
	case "image", "video", "pattern", "shader":
		return refSlug.MatchString(ref)
	}
	return true
}
