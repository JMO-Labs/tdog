# tdog

Self-hosted web terminal workspace for headless machines. Feels local, with tiled split scenes,
presets, animated backgrounds and a 90s-MTV-style shell.

> Status: pre-alpha. Design: [docs/spec.md](docs/spec.md) · Decisions: [docs/decisions/](docs/decisions/)

## Dev

```bash
go run ./cmd/tdog            # server on :7681 (TDOG_ADDR to change)
cd web && npm ci && npm run dev
./scripts/test.sh            # all tests; writes junit.xml + coverage.xml
```

## License

MIT
