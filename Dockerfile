FROM node:24-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.26 AS go
WORKDIR /src
COPY go.mod ./
COPY cmd cmd
COPY internal internal
RUN CGO_ENABLED=0 go build -o /tdog ./cmd/tdog

# ponytail: web/dist copied but not served yet; embedding lands in v0.1 tickets.
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates zsh && rm -rf /var/lib/apt/lists/*
COPY --from=go /tdog /usr/local/bin/tdog
COPY --from=web /src/web/dist /usr/share/tdog/web
EXPOSE 7681
USER 1000
ENTRYPOINT ["tdog"]
