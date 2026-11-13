package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argonTime    = 1
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
)

type userFile struct {
	Hash string `json:"hash"`
}

func hashPassword(pw string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	enc := base64.RawStdEncoding
	return "argon2id$" + enc.EncodeToString(salt) + "$" + enc.EncodeToString(key), nil
}

func verifyPassword(hash, pw string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 3 || parts[0] != "argon2id" {
		return false
	}
	enc := base64.RawStdEncoding
	salt, err1 := enc.DecodeString(parts[1])
	want, err2 := enc.DecodeString(parts[2])
	if err1 != nil || err2 != nil {
		return false
	}
	got := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

func loadHash(dir string) (string, error) {
	b, err := os.ReadFile(filepath.Join(dir, "auth.json"))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var u userFile
	if err := json.Unmarshal(b, &u); err != nil {
		return "", fmt.Errorf("auth.json: %w", err)
	}
	return u.Hash, nil
}

func saveHash(dir, hash string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	b, _ := json.Marshal(userFile{Hash: hash})
	tmp, err := os.CreateTemp(dir, "auth-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil { // CreateTemp files are 0600
		return err
	}
	return os.Rename(tmp.Name(), filepath.Join(dir, "auth.json"))
}
