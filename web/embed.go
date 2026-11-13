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

// FS returns the contents of web/dist.
func FS() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		return dist
	}
	return sub
}
