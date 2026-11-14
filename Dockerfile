FROM node:24-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.26 AS go
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY internal internal
COPY web/embed.go web/embed.go
COPY --from=web /src/web/dist web/dist
RUN CGO_ENABLED=0 go build -o /tdog ./cmd/tdog

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates zsh && rm -rf /var/lib/apt/lists/*
COPY --from=go /tdog /usr/local/bin/tdog
EXPOSE 7681
USER 1000
ENTRYPOINT ["tdog"]
