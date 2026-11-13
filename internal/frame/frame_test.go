package frame

import (
	"bytes"
	"testing"
)

func TestEncode(t *testing.T) {
	tests := []struct {
		name    string
		typ     Type
		payload []byte
		want    []byte
	}{
		{"output", Output, []byte("hi"), []byte{0x00, 'h', 'i'}},
		{"input", Input, []byte("x"), []byte{0x01, 'x'}},
		{"resize", Resize, []byte(`{}`), []byte{0x02, '{', '}'}},
		{"control empty", Control, nil, []byte{0x03}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Encode(tc.typ, tc.payload); !bytes.Equal(got, tc.want) {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}

func TestDecode(t *testing.T) {
	tests := []struct {
		name    string
		in      []byte
		typ     Type
		payload []byte
		wantErr bool
	}{
		{"output", []byte{0x00, 'a'}, Output, []byte("a"), false},
		{"input", []byte{0x01, 'a', 'b'}, Input, []byte("ab"), false},
		{"type only", []byte{0x03}, Control, []byte{}, false},
		{"empty", nil, 0, nil, true},
		{"unknown type", []byte{0x09, 1}, 0, nil, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			typ, p, err := Decode(tc.in)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err=%v wantErr=%v", err, tc.wantErr)
			}
			if err == nil && (typ != tc.typ || !bytes.Equal(p, tc.payload)) {
				t.Fatalf("got %v %v", typ, p)
			}
		})
	}
}

func TestParseResize(t *testing.T) {
	tests := []struct {
		name       string
		in         string
		cols, rows uint16
		wantErr    bool
	}{
		{"ok", `{"cols":120,"rows":40}`, 120, 40, false},
		{"zero cols", `{"cols":0,"rows":40}`, 0, 0, true},
		{"zero rows", `{"cols":80,"rows":0}`, 0, 0, true},
		{"negative", `{"cols":-1,"rows":5}`, 0, 0, true},
		{"max", `{"cols":65535,"rows":65535}`, 65535, 65535, false},
		{"cols too big", `{"cols":65536,"rows":5}`, 0, 0, true},
		{"rows too big", `{"cols":5,"rows":65536}`, 0, 0, true},
		{"bad json", `nope`, 0, 0, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c, r, err := ParseResize([]byte(tc.in))
			if (err != nil) != tc.wantErr {
				t.Fatalf("err=%v wantErr=%v", err, tc.wantErr)
			}
			if err == nil && (c != tc.cols || r != tc.rows) {
				t.Fatalf("got %d,%d", c, r)
			}
		})
	}
}

func TestExitControl(t *testing.T) {
	got := string(ExitControl(3)[1:])
	if got != `{"type":"exit","code":3}` {
		t.Fatalf("got %s", got)
	}
}
