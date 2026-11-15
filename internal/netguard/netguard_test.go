package netguard

import (
	"errors"
	"net"
	"testing"
)

func TestPublicIP(t *testing.T) {
	cases := map[string]bool{
		"8.8.8.8":              true,
		"2606:4700:4700::1111": true,
		"127.0.0.1":            false, // loopback
		"::1":                  false,
		"10.1.2.3":             false, // private
		"172.16.0.1":           false,
		"192.168.1.1":          false,
		"169.254.169.254":      false, // link-local (cloud metadata)
		"fe80::1":              false,
		"100.64.0.1":           false, // CGNAT
		"fd00::1":              false, // unique local
		"0.0.0.0":              false, // unspecified
		"224.0.0.1":            false, // multicast
		"::ffff:10.0.0.1":      false, // v4-mapped private
		"::ffff:8.8.8.8":       true,
	}
	for in, want := range cases {
		if got := PublicIP(net.ParseIP(in)); got != want {
			t.Errorf("PublicIP(%s) = %v, want %v", in, got, want)
		}
	}
}

func TestDialControl(t *testing.T) {
	ctl := DialControl(nil)
	if err := ctl("tcp", "8.8.8.8:443", nil); err != nil {
		t.Errorf("public address blocked: %v", err)
	}
	for _, addr := range []string{"127.0.0.1:443", "[::1]:443", "10.0.0.1:80", "not-an-addr"} {
		if err := ctl("tcp", addr, nil); !errors.Is(err, ErrBlocked) {
			t.Errorf("%s: want ErrBlocked, got %v", addr, err)
		}
	}
}
