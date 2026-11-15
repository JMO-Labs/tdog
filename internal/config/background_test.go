package config

import "testing"

func TestGradientStructure(t *testing.T) {
	// a second top-level group after the first closes
	if validGradient("linear-gradient(red, blue) rgb(1,2,3)") {
		t.Error("trailing group accepted")
	}
	// stray close paren before the end
	if validGradient("linear-gradient(red))") {
		t.Error("unbalanced accepted")
	}
	if !validGradient("linear-gradient(red, rgb(1,2,3))") {
		t.Error("valid nested colour rejected")
	}
}

func TestValidRefPassThrough(t *testing.T) {
	for _, k := range []string{"none", "color"} {
		if !validRef(k, "anything goes") {
			t.Errorf("%s", k)
		}
	}
}

func TestStoreDir(t *testing.T) {
	if got := NewStore("/x/y").Dir(); got != "/x/y" {
		t.Fatalf("got %q", got)
	}
}
