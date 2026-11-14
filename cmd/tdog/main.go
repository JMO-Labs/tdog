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

// fatal is swapped in tests so main's error path is observable.
var fatal = log.Fatal

func main() {
	if err := run(os.Getenv, http.ListenAndServe); err != nil {
		fatal(err)
	}
}

// run wires config, auth and the server; serve is injectable for tests.
func run(getenv func(string) string, serve func(string, http.Handler) error) error {
	addr := getenv("TDOG_ADDR")
	if addr == "" {
		addr = ":7681"
	}
	dir := getenv("TDOG_DATA")
	if dir == "" {
		dir = "/data"
	}
	a, err := auth.New(dir, log.Printf)
	if err != nil {
		return err
	}
	log.Printf("tdog listening on %s", addr)
	return serve(addr, server.NewSecured(web.FS(), a))
}
