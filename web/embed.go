// Package web embeds the built frontend (web/dist).
package web

import (
	"embed"
	"io/fs"
)

// dist always has at least .gitkeep so builds work without a web build.
//
//go:embed all:dist
var dist embed.FS

// subFS is a seam for testing the fallback path.
var subFS = fs.Sub

// FS returns the contents of web/dist.
func FS() fs.FS {
	sub, err := subFS(dist, "dist")
	if err != nil {
		return dist
	}
	return sub
}
