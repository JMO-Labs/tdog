// Command tdog serves the tdog web terminal.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/JMO-Labs/tdog/internal/auth"
	"github.com/JMO-Labs/tdog/internal/server"
	"github.com/JMO-Labs/tdog/web"
)

func main() {
	addr := os.Getenv("TDOG_ADDR")
	if addr == "" {
		addr = ":7681"
	}
	dir := os.Getenv("TDOG_DATA")
	if dir == "" {
		dir = "/data"
	}
	a, err := auth.New(dir, log.Printf)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("tdog listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, server.NewSecured(web.FS(), a)))
}
