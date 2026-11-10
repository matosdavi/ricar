# Imagem de produção: compila o Go e leva só o binário + o site.
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
COPY . .
# go mod tidy completa o go.sum (no ambiente de build há acesso aos pacotes do Go)
RUN go mod tidy && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=build /out/server /app/server
COPY web /app/web
COPY painel /app/painel
ENV PORTA=8080 PASTA_WEB=/app/web PASTA_PAINEL=/app/painel
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/server"]
