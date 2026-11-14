package config

// Hook is a command list: a bare string, or { mode, run }.
type Hook struct {
	Mode string   `toml:"mode,omitempty"`
	Run  []string `toml:"run,omitempty"`

	bad   string // decode problem, reported by validation with the field path
	badAt string // sub-key the problem is at ("" = the hook itself)
}

// UnmarshalTOML accepts the string shorthand and the table form.
func (h *Hook) UnmarshalTOML(data any) error {
	switch v := data.(type) {
	case string:
		h.Mode, h.Run = "all", []string{v}
	case map[string]any:
		for k, val := range v {
			switch k {
			case "mode":
				s, ok := val.(string)
				if !ok {
					h.bad, h.badAt = "must be a string", "mode"
				}
				h.Mode = s
			case "run":
				l, ok := val.([]any)
				if !ok {
					h.bad, h.badAt = "must be a list of strings", "run"
				}
				for _, e := range l {
					s, ok := e.(string)
					if !ok {
						h.bad, h.badAt = "must be a list of strings", "run"
					}
					h.Run = append(h.Run, s)
				}
			default:
				h.bad, h.badAt = "unknown key", k
			}
		}
		if h.Mode == "" {
			h.Mode = "all"
		}
	default:
		h.bad = "must be a string or a table"
	}
	return nil
}

func (h *Hook) validate(path string) *ValidationError {
	if h == nil {
		return nil
	}
	if h.bad != "" {
		if h.badAt != "" {
			path += "." + h.badAt
		}
		return verr(path, "%s", h.bad)
	}
	if h.Mode != "all" && h.Mode != "stop_on_fail" {
		return verr(path+".mode", "must be \"all\" or \"stop_on_fail\"")
	}
	if len(h.Run) == 0 {
		return verr(path+".run", "must list at least one command")
	}
	return nil
}
