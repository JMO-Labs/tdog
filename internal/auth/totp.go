package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // RFC 6238 default; HMAC-SHA1 is not weakened by SHA1 collisions
	"crypto/sha256"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
)

const (
	totpPeriod = 30
	totpDigits = 6
	totpSkew   = 1
	recoveryN  = 10
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// hotp computes RFC 4226 HOTP with HMAC-SHA1.
func hotp(secret []byte, counter uint64, digits int) string {
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	m := hmac.New(sha1.New, secret)
	m.Write(buf[:])
	sum := m.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	n := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	mod := uint32(1)
	for i := 0; i < digits; i++ {
		mod *= 10
	}
	return fmt.Sprintf("%0*d", digits, n%mod)
}

// totpAt computes the RFC 6238 code for unix time t.
func totpAt(secret []byte, t int64, digits int) string {
	return hotp(secret, uint64(t/totpPeriod), digits)
}

// matchTOTP returns the time step matching code within ±totpSkew of now,
// accepting only steps after lastStep (replay protection).
func matchTOTP(secret []byte, code string, now, lastStep int64) (int64, bool) {
	code = strings.TrimSpace(code)
	if len(code) != totpDigits {
		return 0, false
	}
	cur := now / totpPeriod
	found := int64(-1)
	for d := int64(-totpSkew); d <= totpSkew; d++ {
		s := cur + d
		if s > lastStep && hmac.Equal([]byte(hotp(secret, uint64(s), totpDigits)), []byte(code)) {
			found = s // keep scanning: constant work regardless of match
		}
	}
	return found, found >= 0
}

// randRead is a seam for tests.
var randRead = rand.Read

func newSecret() ([]byte, error) {
	b := make([]byte, 20)
	_, err := randRead(b)
	return b, err
}

func otpauthURI(secret []byte, account string) string {
	q := url.Values{"secret": {b32.EncodeToString(secret)}, "issuer": {"tdog"},
		"algorithm": {"SHA1"}, "digits": {"6"}, "period": {"30"}}
	return "otpauth://totp/tdog:" + url.PathEscape(account) + "?" + q.Encode()
}

func normRecovery(c string) string {
	return strings.ToLower(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(c)))
}

func hashRecovery(c string) string {
	h := sha256.Sum256([]byte(normRecovery(c)))
	return hex.EncodeToString(h[:])
}

// newRecoveryCodes returns plaintext codes and their hashes.
func newRecoveryCodes() (plain, hashed []string, err error) {
	for i := 0; i < recoveryN; i++ {
		b := make([]byte, 5)
		if _, err = randRead(b); err != nil {
			return nil, nil, err
		}
		h := hex.EncodeToString(b)
		c := h[:5] + "-" + h[5:]
		plain = append(plain, c)
		hashed = append(hashed, hashRecovery(c))
	}
	return plain, hashed, nil
}
