#!/usr/bin/env bash
# Runs all tests; writes junit.xml + coverage.xml in repo root (wq-ci contract).
set -uo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)

go test -json -coverprofile="$tmp/go.out" ./... > "$tmp/go.json"
go_rc=$?
# Print the output of failed Go tests (and package-level output, e.g. panics).
python3 - "$tmp/go.json" <<'PY'
import json, sys
from collections import defaultdict
out, failed = defaultdict(list), []
for line in open(sys.argv[1]):
    try:
        ev = json.loads(line)
    except ValueError:
        continue
    key = (ev.get("Package", ""), ev.get("Test") or "")
    if ev.get("Action") == "output":
        out[key].append(ev.get("Output", ""))
    elif ev.get("Action") == "fail":
        failed.append(key)
for key in failed:
    print("=== FAIL %s %s" % key)
    print("".join(out[key][-200:]), end="")
PY

(cd web && npm ci --silent && npx vitest run --coverage)
web_rc=$?

python3 scripts/reports.py "$tmp/go.json" "$tmp/go.out" web/junit.xml web/coverage/cobertura-coverage.xml
rep_rc=$?
exit $(( go_rc || web_rc || rep_rc ))
