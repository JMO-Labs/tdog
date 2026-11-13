#!/usr/bin/env bash
# Runs all tests; writes junit.xml + coverage.xml in repo root (wq-ci contract).
set -uo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)

go test -json -coverprofile="$tmp/go.out" ./... > "$tmp/go.json"
go_rc=$?
grep -h '"Action":"fail"' "$tmp/go.json" | head -20

(cd web && npm ci --silent && npx vitest run --coverage)
web_rc=$?

python3 scripts/reports.py "$tmp/go.json" "$tmp/go.out" web/junit.xml web/coverage/cobertura-coverage.xml
rep_rc=$?
exit $(( go_rc || web_rc || rep_rc ))
