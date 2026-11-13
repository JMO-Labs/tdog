// Command tdog serves the tdog web terminal.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/JMO-Labs/tdog/internal/server"
)

func main() {
	addr := os.Getenv("TDOG_ADDR")
	if addr == "" {
		addr = ":7681"
	}
	// Real providers (ADR-0003) are not implemented yet: the terminal stays
	// unmounted unless the developer explicitly opts out of auth.
	var auth server.Auth
	if os.Getenv("TDOG_DEV_NOAUTH") == "1" {
		log.Print("WARNING: TDOG_DEV_NOAUTH=1, /ws/term is unauthenticated")
		auth = func(*http.Request) bool { return true }
	}
	log.Printf("tdog listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, server.New(auth)))
}
