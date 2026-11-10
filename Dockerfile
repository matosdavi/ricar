# Imagem de produção: compila o Go e leva só o binário + o site.
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
COPY . .
# -mod=mod deixa o build baixar e anotar no go.sum só o que o servidor usa,
# nas versões já fixadas no go.mod. (O go mod tidy buscava também as
# dependências de teste das bibliotecas, e uma delas exige um Go mais novo.)
RUN CGO_ENABLED=0 go build -mod=mod -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=build /out/server /app/server
COPY web /app/web
COPY painel /app/painel
ENV PORTA=8080 PASTA_WEB=/app/web PASTA_PAINEL=/app/painel
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/server"]
