// Package frame encodes and decodes tdog's terminal wire frames:
// one type byte followed by the payload.
package frame

import (
	"encoding/json"
	"errors"
	"fmt"
)

// Type is the 1-byte frame type prefix.
type Type byte

// Frame types (spec §4).
const (
	Output  Type = 0x00 // server → client: PTY bytes
	Input   Type = 0x01 // client → server: keystrokes
	Resize  Type = 0x02 // client → server: JSON {"cols","rows"}
	Control Type = 0x03 // either way: JSON
)

// Encode returns type byte + payload.
func Encode(t Type, payload []byte) []byte {
	out := make([]byte, 0, len(payload)+1)
	out = append(out, byte(t))
	return append(out, payload...)
}

// Decode splits a frame into type and payload. The payload aliases b.
func Decode(b []byte) (Type, []byte, error) {
	if len(b) == 0 {
		return 0, nil, errors.New("frame: empty")
	}
	t := Type(b[0])
	if t > Control {
		return 0, nil, fmt.Errorf("frame: unknown type 0x%02x", b[0])
	}
	return t, b[1:], nil
}

// ParseResize parses a Resize payload; both dimensions must be 1..65535.
func ParseResize(p []byte) (cols, rows uint16, err error) {
	var v struct {
		Cols int `json:"cols"`
		Rows int `json:"rows"`
	}
	if err := json.Unmarshal(p, &v); err != nil {
		return 0, 0, fmt.Errorf("frame: resize: %w", err)
	}
	if v.Cols < 1 || v.Cols > 65535 || v.Rows < 1 || v.Rows > 65535 {
		return 0, 0, errors.New("frame: resize out of range")
	}
	return uint16(v.Cols), uint16(v.Rows), nil
}

// ExitControl builds the control frame announcing the process exit code.
func ExitControl(code int) []byte {
	p, _ := json.Marshal(struct {
		Type string `json:"type"`
		Code int    `json:"code"`
	}{"exit", code})
	return Encode(Control, p)
}

// ErrorControl builds a control frame reporting a connection/target error.
func ErrorControl(msg string) []byte {
	p, _ := json.Marshal(struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}{"error", msg})
	return Encode(Control, p)
}

// Pong answers a ping control payload with a pong echoing its "t" field.
// ok is false when p is not a ping.
func Pong(p []byte) (f []byte, ok bool) {
	var v struct {
		Type string          `json:"type"`
		T    json.RawMessage `json:"t,omitempty"`
	}
	if json.Unmarshal(p, &v) != nil || v.Type != "ping" {
		return nil, false
	}
	v.Type = "pong"
	out, _ := json.Marshal(v)
	return Encode(Control, out), true
}
