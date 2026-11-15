// Package netguard provides SSRF protection by checking that dial addresses are public IPs.
package netguard

import (
	"errors"
	"net"
	"net/netip"
	"syscall"
)

// ErrBlocked is returned when a dial is rejected due to SSRF policy.
var ErrBlocked = errors.New("target address not allowed")

var cgnat = netip.MustParsePrefix("100.64.0.0/10")

// PublicIP reports whether ip is a globally routable unicast address.
func PublicIP(ip net.IP) bool {
	a, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	a = a.Unmap()
	return a.IsGlobalUnicast() && !a.IsPrivate() && !a.IsLoopback() && !a.IsLinkLocalUnicast() && !cgnat.Contains(a)
}

// DialControl returns a syscall.Control func that rejects dials to non-public IPs.
func DialControl(allow func(net.IP) bool) func(string, string, syscall.RawConn) error {
	if allow == nil {
		allow = PublicIP
	}
	return func(_, addr string, _ syscall.RawConn) error {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return ErrBlocked
		}
		if ip := net.ParseIP(host); ip == nil || !allow(ip) {
			return ErrBlocked
		}
		return nil
	}
}
