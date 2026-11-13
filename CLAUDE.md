# tdog: agent guide

Web terminal workspace. Go backend (`cmd/`, `internal/`) + React/Vite/TS frontend (`web/`).
Read `docs/spec.md` before feature work; ADRs in `docs/decisions/` are binding.

## Commands
- Tests (CI gate): `./scripts/test.sh` → must stay green; writes `junit.xml` + `coverage.xml`.
- Go: `gofmt -w cmd internal`, `go vet ./...`, golangci-lint in CI.
- Web: `cd web && npm run typecheck && npm run fmt:check`.

## No local Go toolchain (swarm workers)
- Workers can't compile Go; CI is the build + test gate. Write Go carefully, keep it gofmt-clean.
- New Go dependency: just import it. CI autofix runs `go mod tidy` and commits go.mod/go.sum.
- Prefer stdlib; approved deps so far: creack/pty, coder/websocket, golang.org/x/crypto.

## Rules
- Conventional Commits (commitlint enforced). SemVer via semantic-release on `main`.
- PRs target `dev`. Never edit `.github/workflows/*` (owner only).
- Keep files < 500 lines. Stdlib/native first; no new dependency without need.
- Security is non-negotiable: every HTTP route and WS upgrade authenticated (see ADR-0003).
- New logic ships with tests (Go `_test.go`, web `*.test.ts(x)` via vitest).
