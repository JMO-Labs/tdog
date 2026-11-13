# tdog

Self-hosted web terminal workspace for headless machines. Feels local, with tiled split scenes,
presets, animated backgrounds and a 90s-MTV-style shell.

> Status: pre-alpha. Design: [docs/spec.md](docs/spec.md) · Decisions: [docs/decisions/](docs/decisions/)

## ssh-host target

`/ws/term?target=ssh-host` opens a shell on the real host over SSH (`?target=container` runs a
shell inside the container; default is `container`).

Host setup:

```bash
# on the host: enable sshd, then authorise tdog's key
ssh-keygen -t ed25519 -N '' -f ./data/ssh/id_ed25519      # key tdog will use
cat ./data/ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

```bash
docker run -d -p 7681:7681 \
  --add-host host.docker.internal:host-gateway \
  -v "$PWD/data:/data" \
  -e TDOG_SSH_USER="$USER" \
  tdog
```

| Env | Default |
|---|---|
| `TDOG_SSH_HOST` | `host.docker.internal` |
| `TDOG_SSH_PORT` | `22` |
| `TDOG_SSH_USER` | `$USER`, else `root` |

The key is read from `/data/ssh/id_ed25519`. The host key is pinned on first use in
`/data/ssh/known_hosts`; if it later changes the connection is refused with an error frame. Remove
the line from that file only if the change is expected.

## Dev

```bash
go run ./cmd/tdog            # server on :7681 (TDOG_ADDR to change)
cd web && npm ci && npm run dev
./scripts/test.sh            # all tests; writes junit.xml + coverage.xml
```

## License

MIT
