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
	log.Printf("tdog listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, server.New()))
}
